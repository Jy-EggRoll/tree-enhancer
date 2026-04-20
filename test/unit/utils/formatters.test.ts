import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Formatters } from '@/utils/formatters';
import { ConfigManager } from '@/config';

// Mock ConfigManager
vi.mock('@/config', () => ({
  ConfigManager: {
    getFileSizeBase: vi.fn().mockReturnValue(1000),
    get: vi.fn((key: string, defaultValue: any) => defaultValue),
    getStatusBarTemplate: vi.fn().mockReturnValue('{folderName}: {totalSize} ({fileCount} files, {folderCount} folders)'),
  },
}));

describe('Formatters', () => {
  describe('formatFileSize', () => {
    it('should format 0 bytes correctly', () => {
      expect(Formatters.formatFileSize(0)).toBe('0 B');
    });

    it('should format bytes with decimal base (1000)', () => {
      expect(Formatters.formatFileSize(500, 1000)).toBe('500 B');
      expect(Formatters.formatFileSize(1000, 1000)).toBe('1 KB');
      expect(Formatters.formatFileSize(1500, 1000)).toBe('1.5 KB');
    });

    it('should format bytes with binary base (1024)', () => {
      expect(Formatters.formatFileSize(1024, 1024)).toBe('1 KiB');
      expect(Formatters.formatFileSize(1536, 1024)).toBe('1.5 KiB');
      expect(Formatters.formatFileSize(1048576, 1024)).toBe('1 MiB');
    });

    it('should handle large file sizes', () => {
      expect(Formatters.formatFileSize(1073741824, 1000)).toBe('1.07 GB');
      expect(Formatters.formatFileSize(1099511627776, 1024)).toBe('1 TiB');
    });

    it('should use ConfigManager base when not provided', () => {
      const result = Formatters.formatFileSize(1000);
      expect(result).toBe('1 KB');
    });
  });

  describe('formatDate', () => {
    it('should format date with default template', () => {
      const date = new Date('2024-01-15 14:30:45');
      const result = Formatters.formatDate(date, 'YYYY-MM-DD HH:mm:ss');
      expect(result).toBe('2024-01-15 14:30:45');
    });

    it('should format date with custom template', () => {
      const date = new Date('2024-12-25 09:05:00');
      const result = Formatters.formatDate(date, 'YYYY/MM/DD HH:mm');
      expect(result).toBe('2024/12/25 09:05');
    });

    it('should pad single digits with zeros', () => {
      const date = new Date('2024-03-05 08:05:09');
      const result = Formatters.formatDate(date, 'YYYY-MM-DD HH:mm:ss');
      expect(result).toBe('2024-03-05 08:05:09');
    });
  });

  describe('renderTemplate', () => {
    it('should replace basic variables', () => {
      const template = 'File: {name}, Size: {size}';
      const variables = {
        name: 'test.txt',
        size: '1.5 KB',
        rawSize: 1536,
        modifiedTime: '2024-01-15 10:00:00',
        rawModifiedTime: new Date('2024-01-15 10:00:00'),
      };
      const result = Formatters.renderTemplate(template, variables);
      expect(result).toBe('File: test.txt, Size: 1.5 KB');
    });

    it('should replace all variables', () => {
      const template = '{name}|{size}|{rawSize}|{modifiedTime}|{fileCount}|{folderCount}|{resolution}|{width}|{height}';
      const variables = {
        name: 'image.png',
        size: '2 MB',
        rawSize: 2097152,
        modifiedTime: '2024-01-15',
        rawModifiedTime: new Date(),
        fileCount: 10,
        folderCount: 2,
        resolution: '1920 * 1080',
        width: 1920,
        height: 1080,
      };
      const result = Formatters.renderTemplate(template, variables);
      expect(result).toBe('image.png|2 MB|2097152|2024-01-15|10|2|1920 * 1080|1920|1080');
    });

    it('should remove undefined resolution placeholders', () => {
      const template = 'Size: {size}, Resolution: {resolution}';
      const variables = {
        name: 'file.txt',
        size: '1 KB',
        rawSize: 1024,
        modifiedTime: '2024-01-15',
        rawModifiedTime: new Date(),
      };
      const result = Formatters.renderTemplate(template, variables);
      expect(result).toBe('Size: 1 KB, Resolution: ');
    });

    it('should handle empty template', () => {
      const variables = {
        name: 'test.txt',
        modifiedTime: '2024-01-15',
        rawModifiedTime: new Date(),
      };
      const result = Formatters.renderTemplate('', variables);
      expect(result).toBe('');
    });
  });

  describe('formatImageResolution', () => {
    it('should format resolution with default template', () => {
      const dimensions = { width: 1920, height: 1080 };
      const result = Formatters.formatImageResolution(dimensions);
      expect(result).toBe('1920 * 1080');
    });

    it('should format resolution with custom template', () => {
      const dimensions = { width: 800, height: 600 };
      const result = Formatters.formatImageResolution(dimensions, '{width}x{height}');
      expect(result).toBe('800x600');
    });
  });

  describe('createFileVariables', () => {
    it('should create variables for regular file', () => {
      const fileName = 'document.pdf';
      const fileSize = 2048;
      const modifiedTime = new Date('2024-01-15 10:30:00');

      const variables = Formatters.createFileVariables(fileName, fileSize, modifiedTime);

      expect(variables.name).toBe('document.pdf');
      expect(variables.size).toBe('2.05 KB'); // 2048 bytes = 2.05 KB (with 2 decimal places)
      expect(variables.rawSize).toBe(2048);
      expect(variables.modifiedTime).toBeDefined();
      expect(variables.resolution).toBeUndefined();
    });

    it('should create variables with image dimensions', () => {
      const fileName = 'photo.jpg';
      const fileSize = 1048576;
      const modifiedTime = new Date('2024-01-15 10:30:00');
      const imageDimensions = { width: 1920, height: 1080 };

      const variables = Formatters.createFileVariables(fileName, fileSize, modifiedTime, imageDimensions);

      expect(variables.name).toBe('photo.jpg');
      expect(variables.resolution).toBe('1920 * 1080');
      expect(variables.width).toBe(1920);
      expect(variables.height).toBe(1080);
    });
  });

  describe('formatForStatusBar', () => {
    it('should format folder calculation result for status bar', () => {
      const result = {
        folderName: 'my-project',
        totalSize: 10485760,
        fileCount: 150,
        folderCount: 20,
        modifiedTime: new Date('2024-01-15').getTime(),
      };

      const result_str = Formatters.formatForStatusBar(result);
      expect(result_str).toContain('my-project');
      expect(result_str).toContain('150');
      expect(result_str).toContain('20');
    });
  });
});
