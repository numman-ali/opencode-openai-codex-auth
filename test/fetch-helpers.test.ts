import { describe, it, expect, vi } from 'vitest';
import {
    shouldRefreshToken,
    refreshAndUpdateToken,
    extractRequestUrl,
    rewriteUrlForCodex,
    createCodexHeaders,
    handleErrorResponse,
} from '../lib/request/fetch-helpers.js';
import * as authModule from '../lib/auth/auth.js';
import type { Auth } from '../lib/types.js';
import { URL_PATHS, OPENAI_HEADERS, OPENAI_HEADER_VALUES, PLUGIN_NAME, ERROR_MESSAGES } from '../lib/constants.js';

describe('Fetch Helpers Module', () => {
	describe('shouldRefreshToken', () => {
		it('should return true for non-oauth auth', () => {
			const auth: Auth = { type: 'api', key: 'test-key' };
			expect(shouldRefreshToken(auth)).toBe(true);
		});

		it('should return true when access token is missing', () => {
			const auth: Auth = { type: 'oauth', access: '', refresh: 'refresh-token', expires: Date.now() + 1000 };
			expect(shouldRefreshToken(auth)).toBe(true);
		});

		it('should return true when token is expired', () => {
			const auth: Auth = {
				type: 'oauth',
				access: 'access-token',
				refresh: 'refresh-token',
				expires: Date.now() - 1000 // expired
			};
			expect(shouldRefreshToken(auth)).toBe(true);
		});

		it('should return false for valid oauth token', () => {
			const auth: Auth = {
				type: 'oauth',
				access: 'access-token',
				refresh: 'refresh-token',
				expires: Date.now() + 10000 // valid for 10 seconds
			};
			expect(shouldRefreshToken(auth)).toBe(false);
		});
	});

	describe('refreshAndUpdateToken', () => {
		it('should throw error when token refresh fails', async () => {
			vi.spyOn(authModule, 'refreshAccessToken').mockResolvedValue({ type: 'failed' });

			const auth: Auth = {
				type: 'oauth',
				access: 'old-access',
				refresh: 'old-refresh',
				expires: Date.now() - 1000,
			};
			const mockClient = { auth: { set: vi.fn() } } as any;

			await expect(refreshAndUpdateToken(auth, mockClient)).rejects.toThrow(
				`[${PLUGIN_NAME}] ${ERROR_MESSAGES.TOKEN_REFRESH_FAILED}`
			);
			expect(mockClient.auth.set).not.toHaveBeenCalled();

			vi.restoreAllMocks();
		});

		it('should update auth and return updated state on success', async () => {
			const newTokens = {
				type: 'success' as const,
				access: 'new-access',
				refresh: 'new-refresh',
				expires: Date.now() + 3600000,
			};
			vi.spyOn(authModule, 'refreshAccessToken').mockResolvedValue(newTokens);

			const auth: Auth = {
				type: 'oauth',
				access: 'old-access',
				refresh: 'old-refresh',
				expires: Date.now() - 1000,
			};
			const mockClient = { auth: { set: vi.fn().mockResolvedValue(undefined) } } as any;

			const result = await refreshAndUpdateToken(auth, mockClient);

			expect(mockClient.auth.set).toHaveBeenCalledWith({
				path: { id: 'openai' },
				body: {
					type: 'oauth',
					access: 'new-access',
					refresh: 'new-refresh',
					expires: newTokens.expires,
				},
			});
			expect(result.type).toBe('oauth');
			if (result.type === 'oauth') {
				expect(result.access).toBe('new-access');
				expect(result.refresh).toBe('new-refresh');
			}

			vi.restoreAllMocks();
		});
	});

	describe('extractRequestUrl', () => {
		it('should extract URL from string', () => {
			const url = 'https://example.com/test';
			expect(extractRequestUrl(url)).toBe(url);
		});

		it('should extract URL from URL object', () => {
			const url = new URL('https://example.com/test');
			expect(extractRequestUrl(url)).toBe('https://example.com/test');
		});

		it('should extract URL from Request object', () => {
			const request = new Request('https://example.com/test');
			expect(extractRequestUrl(request)).toBe('https://example.com/test');
		});
	});

	describe('rewriteUrlForCodex', () => {
		it('should rewrite /responses to /codex/responses', () => {
			const url = 'https://chatgpt.com/backend-api/responses';
			expect(rewriteUrlForCodex(url)).toBe('https://chatgpt.com/backend-api/codex/responses');
		});

		it('should not modify URL without /responses', () => {
			const url = 'https://chatgpt.com/backend-api/other';
			expect(rewriteUrlForCodex(url)).toBe(url);
		});

		it('should only replace first occurrence', () => {
			const url = 'https://example.com/responses/responses';
			const result = rewriteUrlForCodex(url);
			expect(result).toBe('https://example.com/codex/responses/responses');
		});
	});

		describe('createCodexHeaders', () => {
	const accountId = 'test-account-123';
	const accessToken = 'test-access-token';

		it('should create headers with all required fields when cache key provided', () => {
	    const headers = createCodexHeaders(undefined, accountId, accessToken, { model: 'gpt-5-codex', promptCacheKey: 'session-1' });

	    expect(headers.get('Authorization')).toBe(`Bearer ${accessToken}`);
	    expect(headers.get(OPENAI_HEADERS.ACCOUNT_ID)).toBe(accountId);
	    expect(headers.get(OPENAI_HEADERS.BETA)).toBe(OPENAI_HEADER_VALUES.BETA_RESPONSES);
	    expect(headers.get(OPENAI_HEADERS.ORIGINATOR)).toBe(OPENAI_HEADER_VALUES.ORIGINATOR_CODEX);
	    expect(headers.get(OPENAI_HEADERS.SESSION_ID)).toBe('session-1');
	    expect(headers.get(OPENAI_HEADERS.CONVERSATION_ID)).toBe('session-1');
	    expect(headers.get('accept')).toBe('text/event-stream');
    });

    it('returns original response for usage limit errors (OpenCode handles display)', async () => {
        const body = {
            error: {
                code: 'usage_limit_reached',
                message: 'limit reached',
                plan_type: 'pro',
            },
        };
        const headers = new Headers({
            'x-codex-primary-used-percent': '75',
            'x-codex-primary-window-minutes': '300',
            'x-codex-primary-reset-at': String(Math.floor(Date.now() / 1000) + 1800),
        });
        const resp = new Response(JSON.stringify(body), { status: 429, headers });
        const result = await handleErrorResponse(resp);
        // Should return original response with same status
        expect(result.status).toBe(429);
        // Body should be preserved (original response, not enriched)
        const json = await result.json() as any;
        expect(json.error.code).toBe('usage_limit_reached');
        expect(json.error.message).toBe('limit reached');
    });

		it('should remove x-api-key header', () => {
        const init = { headers: { 'x-api-key': 'should-be-removed' } } as any;
        const headers = createCodexHeaders(init, accountId, accessToken, { model: 'gpt-5', promptCacheKey: 'session-2' });

			expect(headers.has('x-api-key')).toBe(false);
		});

		it('should preserve other existing headers', () => {
        const init = { headers: { 'Content-Type': 'application/json' } } as any;
        const headers = createCodexHeaders(init, accountId, accessToken, { model: 'gpt-5', promptCacheKey: 'session-3' });

			expect(headers.get('Content-Type')).toBe('application/json');
		});

		it('should use provided promptCacheKey for both conversation_id and session_id', () => {
			const key = 'ses_abc123';
			const headers = createCodexHeaders(undefined, accountId, accessToken, { promptCacheKey: key });
			expect(headers.get(OPENAI_HEADERS.CONVERSATION_ID)).toBe(key);
			expect(headers.get(OPENAI_HEADERS.SESSION_ID)).toBe(key);
		});

		it('does not set conversation/session headers when no promptCacheKey provided', () => {
			const headers = createCodexHeaders(undefined, accountId, accessToken, { model: 'gpt-5' });
			expect(headers.get(OPENAI_HEADERS.CONVERSATION_ID)).toBeNull();
			expect(headers.get(OPENAI_HEADERS.SESSION_ID)).toBeNull();
		});
    });
});
