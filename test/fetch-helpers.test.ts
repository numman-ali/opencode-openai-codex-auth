import { describe, it, expect, vi, afterEach } from 'vitest';
import * as authModule from '../lib/auth/auth.js';
import {
    shouldRefreshToken,
    refreshAndUpdateToken,
    extractRequestUrl,
    rewriteUrlForCodex,
    createCodexHeaders,
    handleErrorResponse,
} from '../lib/request/fetch-helpers.js';
import type { Auth } from '../lib/types.js';
import { URL_PATHS, OPENAI_HEADERS, OPENAI_HEADER_VALUES } from '../lib/constants.js';

describe('Fetch Helpers Module', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

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
		it('throws when refresh fails', async () => {
			const auth: Auth = { type: 'oauth', access: 'old', refresh: 'bad', expires: 0 };
			const client = { auth: { set: vi.fn() } } as any;
			vi.spyOn(authModule, 'refreshAccessToken').mockResolvedValue({ type: 'failed' } as any);

			await expect(refreshAndUpdateToken(auth, client)).rejects.toThrow();
		});

		it('updates stored auth on success', async () => {
			const auth: Auth = { type: 'oauth', access: 'old', refresh: 'oldr', expires: 0 };
			const client = { auth: { set: vi.fn() } } as any;
			vi.spyOn(authModule, 'refreshAccessToken').mockResolvedValue({
				type: 'success',
				access: 'new',
				refresh: 'newr',
				expires: 123,
			} as any);

			const updated = await refreshAndUpdateToken(auth, client);

			expect(client.auth.set).toHaveBeenCalledWith({
				path: { id: 'openai' },
				body: {
					type: 'oauth',
					access: 'new',
					refresh: 'newr',
					expires: 123,
				},
			});
			expect(updated.access).toBe('new');
			expect(updated.refresh).toBe('newr');
			expect(updated.expires).toBe(123);
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

                it('maps usage-limit 404 errors to 429', async () => {
                        const body = {
                                error: {
                                        code: 'usage_limit_reached',
                                        message: 'limit reached',
                                },
                        };
                        const resp = new Response(JSON.stringify(body), { status: 404 });
                        const { response: mapped, rateLimit } = await handleErrorResponse(resp);
                        expect(mapped.status).toBe(429);
                        const json = await mapped.json() as any;
                        expect(json.error.code).toBe('usage_limit_reached');
                        expect(rateLimit?.retryAfterMs).toBeGreaterThan(0);
                });

                it('leaves non-usage 404 errors unchanged', async () => {
                        const body = { error: { code: 'not_found', message: 'nope' } };
                        const resp = new Response(JSON.stringify(body), { status: 404 });
                        const { response: result, rateLimit } = await handleErrorResponse(resp);
                        expect(result.status).toBe(404);
                        const json = await result.json() as any;
                        expect(json.error.code).toBe('not_found');
                        expect(rateLimit).toBeUndefined();
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
