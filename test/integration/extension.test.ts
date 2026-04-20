import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    const extension = vscode.extensions.getExtension('Jy-EggRoll.eggroll-tree-enhancer');
    assert.ok(extension, 'Extension should be installed');
  });

  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('Jy-EggRoll.eggroll-tree-enhancer');
    if (extension) {
      await extension.activate();
      assert.strictEqual(extension.isActive, true, 'Extension should be active');
    }
  });

  test('Calculate Folder command should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    const calculateCommand = commands.find(cmd => cmd === 'tree-enhancer.calculateFolder');
    assert.ok(calculateCommand, 'Calculate Folder command should be registered');
  });

  test('Dismiss Status Bar command should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    const dismissCommand = commands.find(cmd => cmd === 'tree-enhancer.dismissStatusBar');
    assert.ok(dismissCommand, 'Dismiss Status Bar command should be registered');
  });
});
