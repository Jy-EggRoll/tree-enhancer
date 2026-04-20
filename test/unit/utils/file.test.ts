import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileUtils } from '@/utils/file';
import * as vscode from 'vscode';

// Mock vscode module
vi.mock('vscode', () => ({
  Uri: {
    file: vi.fn((path: string) => ({ path, fsPath: path })),
  },
  FileType: {
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  workspace: {
    fs: {
      stat: vi.fn(),
      readDirectory: vi.fn(),
      readFile: vi.fn(),
    },
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      append: vi.fn(),
      appendLine: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
  l10n: {
    t: vi.fn((message: string, ...args: any[]) => {
      // Simple mock: replace placeholders like {0}, {1} with args
      let result = message;
      args.forEach((arg, index) => {
        result = result.replace(`{${index}}`, String(arg));
      });
      return result;
    }),
  },
}));

// Mock image-size
vi.mock('image-size', () => ({
  imageSize: vi.fn(),
}));

import { imageSize } from 'image-size';

describe('FileUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFileName', () => {
    it('should extract filename from Unix path', () => {
      const result = FileUtils.getFileName('/home/user/documents/file.txt');
      expect(result).toBe('file.txt');
    });

    it('should extract filename from nested path', () => {
      const result = FileUtils.getFileName('/a/b/c/d/e/file.js');
      expect(result).toBe('file.js');
    });

    it('should return the path if no directory separator', () => {
      const result = FileUtils.getFileName('file.txt');
      expect(result).toBe('file.txt');
    });

    it('should handle empty path', () => {
      const result = FileUtils.getFileName('');
      expect(result).toBe('');
    });
  });

  describe('isSupportedImage', () => {
    it('should return true for supported image formats', () => {
      expect(FileUtils.isSupportedImage('photo.jpg')).toBe(true);
      expect(FileUtils.isSupportedImage('image.jpeg')).toBe(true);
      expect(FileUtils.isSupportedImage('picture.png')).toBe(true);
      expect(FileUtils.isSupportedImage('animation.gif')).toBe(true);
      expect(FileUtils.isSupportedImage('webp-image.webp')).toBe(true);
      expect(FileUtils.isSupportedImage('vector.svg')).toBe(true);
    });

    it('should return false for unsupported file formats', () => {
      expect(FileUtils.isSupportedImage('document.pdf')).toBe(false);
      expect(FileUtils.isSupportedImage('script.js')).toBe(false);
      expect(FileUtils.isSupportedImage('readme.md')).toBe(false);
      expect(FileUtils.isSupportedImage('data.json')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(FileUtils.isSupportedImage('PHOTO.JPG')).toBe(true);
      expect(FileUtils.isSupportedImage('Image.PNG')).toBe(true);
      expect(FileUtils.isSupportedImage('Picture.Gif')).toBe(true);
    });

    it('should handle files without extension', () => {
      expect(FileUtils.isSupportedImage('Makefile')).toBe(false);
      expect(FileUtils.isSupportedImage('README')).toBe(false);
    });

    it('should handle filenames with dots', () => {
      expect(FileUtils.isSupportedImage('my.photo.jpg')).toBe(true);
      expect(FileUtils.isSupportedImage('archive.tar.gz')).toBe(false);
    });
  });

  describe('isDirectory', () => {
    it('should return true for directory type', () => {
      const stat = { type: vscode.FileType.Directory } as vscode.FileStat;
      expect(FileUtils.isDirectory(stat)).toBe(true);
    });

    it('should return false for file type', () => {
      const stat = { type: vscode.FileType.File } as vscode.FileStat;
      expect(FileUtils.isDirectory(stat)).toBe(false);
    });

    it('should return true for combined type flags', () => {
      const stat = { type: vscode.FileType.Directory | vscode.FileType.SymbolicLink } as vscode.FileStat;
      expect(FileUtils.isDirectory(stat)).toBe(true);
    });
  });

  describe('isFile', () => {
    it('should return true for file type', () => {
      const stat = { type: vscode.FileType.File } as vscode.FileStat;
      expect(FileUtils.isFile(stat)).toBe(true);
    });

    it('should return false for directory type', () => {
      const stat = { type: vscode.FileType.Directory } as vscode.FileStat;
      expect(FileUtils.isFile(stat)).toBe(false);
    });

    it('should return true for combined type flags', () => {
      const stat = { type: vscode.FileType.File | vscode.FileType.SymbolicLink } as vscode.FileStat;
      expect(FileUtils.isFile(stat)).toBe(true);
    });
  });

  describe('isDirectoryType', () => {
    it('should return true for directory file type', () => {
      expect(FileUtils.isDirectoryType(vscode.FileType.Directory)).toBe(true);
    });

    it('should return false for file type', () => {
      expect(FileUtils.isDirectoryType(vscode.FileType.File)).toBe(false);
    });
  });

  describe('isFileType', () => {
    it('should return true for file type', () => {
      expect(FileUtils.isFileType(vscode.FileType.File)).toBe(true);
    });

    it('should return false for directory type', () => {
      expect(FileUtils.isFileType(vscode.FileType.Directory)).toBe(false);
    });
  });

  describe('getFileStats', () => {
    it('should return file stats successfully', async () => {
      const mockStat = { type: vscode.FileType.File, size: 1024, mtime: Date.now() };
      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue(mockStat as vscode.FileStat);

      const result = await FileUtils.getFileStats('/test/file.txt');
      expect(result).toEqual(mockStat);
    });

    it('should return null on error', async () => {
      vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(new Error('File not found'));

      const result = await FileUtils.getFileStats('/nonexistent/file.txt');
      expect(result).toBeNull();
    });
  });

  describe('getDirectoryEntries', () => {
    it('should return directory entries successfully', async () => {
      const mockEntries: [string, vscode.FileType][] = [
        ['file1.txt', vscode.FileType.File],
        ['file2.js', vscode.FileType.File],
        ['subdir', vscode.FileType.Directory],
      ];
      vi.mocked(vscode.workspace.fs.readDirectory).mockResolvedValue(mockEntries);

      const result = await FileUtils.getDirectoryEntries('/test/dir');
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ name: 'file1.txt', type: vscode.FileType.File });
      expect(result[2]).toEqual({ name: 'subdir', type: vscode.FileType.Directory });
    });

    it('should return empty array on error', async () => {
      vi.mocked(vscode.workspace.fs.readDirectory).mockRejectedValue(new Error('Access denied'));

      const result = await FileUtils.getDirectoryEntries('/restricted/dir');
      expect(result).toEqual([]);
    });
  });

  describe('getImageDimensions', () => {
    it('should return image dimensions successfully', async () => {
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(Buffer.from('fake-image-data') as any);
      vi.mocked(imageSize).mockReturnValue({ width: 1920, height: 1080 });

      const result = await FileUtils.getImageDimensions('/test/image.png');
      expect(result).toEqual({ width: 1920, height: 1080 });
    });

    it('should return null if dimensions are missing', async () => {
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(Buffer.from('fake-image-data') as any);
      vi.mocked(imageSize).mockReturnValue({} as any);

      const result = await FileUtils.getImageDimensions('/test/image.png');
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('File not found'));

      const result = await FileUtils.getImageDimensions('/nonexistent/image.png');
      expect(result).toBeNull();
    });
  });
});
