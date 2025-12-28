import { describe, it, expect } from 'vitest';
import { getBrowserOpener, openBrowserUrl } from '../lib/auth/browser.js';
import { PLATFORM_OPENERS } from '../lib/constants.js';

describe('Browser Module', () => {
	describe('getBrowserOpener', () => {
		it('should return correct opener for darwin', () => {
			const originalPlatform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'darwin' });
			expect(getBrowserOpener()).toBe(PLATFORM_OPENERS.darwin);
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});

		it('should return correct opener for win32', () => {
			const originalPlatform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'win32' });
			expect(getBrowserOpener()).toBe(PLATFORM_OPENERS.win32);
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});

		it('should return linux opener for other platforms', () => {
			const originalPlatform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'linux' });
			expect(getBrowserOpener()).toBe(PLATFORM_OPENERS.linux);
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});

		it('should handle unknown platforms', () => {
			const originalPlatform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'freebsd' });
			expect(getBrowserOpener()).toBe(PLATFORM_OPENERS.linux);
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});
	});

	describe('openBrowserUrl', () => {
		it('should not throw when browser opener command does not exist', () => {
			// Temporarily set platform to use a non-existent command
			const originalPlatform = process.platform;
			const originalPath = process.env.PATH;

			// Clear PATH to ensure no opener command is found
			process.env.PATH = '';
			Object.defineProperty(process, 'platform', { value: 'linux' });

			// Should not throw even when xdg-open doesn't exist
			expect(() => openBrowserUrl('https://example.com')).not.toThrow();

			// Restore
			process.env.PATH = originalPath;
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});

		it('should handle valid URL without throwing', () => {
			// This test verifies the function doesn't throw for valid input
			// The actual browser opening is not tested as it would open a real browser
			expect(() => openBrowserUrl('https://example.com')).not.toThrow();
		});
	});
});
