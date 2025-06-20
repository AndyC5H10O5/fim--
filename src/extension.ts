import * as vscode from "vscode";
import { FIMProvider } from "./core/control";
import { ConfigManager } from "./config/ConfigManager";
import { cstCache, HISTORY } from "./shared/cst";
import { patch } from "axios";
import { parseFile } from "./core/context/codeCST";
import { ModelPanel } from "./core/panel/ModelPanel";
import { StatusManager } from "./core/status/StatusManager";
//import { getParserForFile } from "./core/context/codeCST";

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "fim--" is now active!');

  const fimProvider = new FIMProvider();
  const provider = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: "**" }, // 所有文件类型都支持
    fimProvider,
  );

  let debounceTimer: NodeJS.Timeout;
  const onEditorChange = vscode.workspace.onDidChangeTextDocument(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    }, ConfigManager.getDebounceTime());
  });

  const onActiveEditorChanged = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor) {
        //console.log("用户切换到了文件:", vscode.workspace.asRelativePath(editor.document.uri));
        /**
         * 假设一个用户只能存在一个文件正在修改
         * 当一个新的文件被打开，我们就需要解析这个文件的CST，并将其加入到历史记录中
         * 当用户正在编辑当前文件，我们应该实时解析当前文件，这就保证了CST的实时性
         */
        const document = editor.document;
        HISTORY.addHistory(vscode.workspace.asRelativePath(document.uri));
        parseFile(document);
      }
    },
  );

  const onWillDeleteFiles = vscode.workspace.onWillDeleteFiles(
    async (event) => {
      event.files.forEach(async (file) => {
        try {
          const stack = [file];
          while (stack.length > 0) {
            const currentFile = stack.pop();
            if (!currentFile) continue;
            const entries =
              await vscode.workspace.fs.readDirectory(currentFile);
            for (const [name, type] of entries) {
              const subFilePath = vscode.Uri.joinPath(currentFile, name);
              //console.log(`将要处理文件: ${vscode.workspace.asRelativePath(subFilePath)}`);
              if (type === vscode.FileType.Directory) {
                stack.push(subFilePath);
              } else if (type === vscode.FileType.File) {
                // 处理文件删除逻辑
                //console.log(`将要删除文件: ${vscode.workspace.asRelativePath(subFilePath)}`);
                const path = vscode.workspace.asRelativePath(subFilePath);
                cstCache.fileChanged(path, []);
                HISTORY.deleteHistory(path);
              }
            }
          }
        } catch (error) {
          console.error(
            `Get err when handle onWillDeleteFiles event: ${error}`,
          );
        }
      });
    },
  );

  const onCompeletionAccepted = vscode.commands.registerCommand(
    "fim--.compeletionAccepted",
    () => {
      StatusManager.addAcceptedItem();
    },
  );

  const showMoreResults = vscode.commands.registerCommand(
    "fim--.showMoreResults",
    () => {
      let a = ConfigManager.getWebviewOpened();
      console.log(a);
      ConfigManager.setWebviewOpened(true);
      a = ConfigManager.getWebviewOpened();
      console.log(a);
      setTimeout(() => {
        ConfigManager.setWebviewOpened(false);
        console.log(ConfigManager.getWebviewOpened());
      }, 1000);
      vscode.window.showInformationMessage("您执行了extension.sayHello命令！");
      ModelPanel.createOrShow("current", ["请先触发代码补全..."]);
    },
  );

    // 注册切换 webview 的命令
  const toggleWebview = vscode.commands.registerCommand(
    "fim--.toggleWebview",
    () => {
      const isOpened = ConfigManager.getWebviewOpened();
      if (isOpened) {
        ModelPanel.hide();
      } else {
        // 如果没有当前补全结果，显示一个欢迎信息
        ModelPanel.createOrShow("welcome", [
          "欢迎使用 AI Completions！",
          "当您触发代码补全时，补全结果将会显示在这里。",
          "您可以使用快捷键 Ctrl+Shift+A (Mac: Cmd+Shift+A) 或点击编辑器右上角的按钮来切换此面板。"
        ]);
      }
    }
  );

  // 注册选择上一个补全项的命令
  const selectPreviousCompletion = vscode.commands.registerCommand(
    "fim--.selectPreviousCompletion",
    () => {
      ModelPanel.selectPreviousCompletion();
      vscode.commands.executeCommand("editor.action.inlineSuggest.showPrevious");
    }
  );

  // 注册选择下一个补全项的命令
  const selectNextCompletion = vscode.commands.registerCommand(
    "fim--.selectNextCompletion",
    () => {
      ModelPanel.selectNextCompletion();
      vscode.commands.executeCommand("editor.action.inlineSuggest.showNext");
    }
  );

  context.subscriptions.push(
    provider,
    onEditorChange,
    onActiveEditorChanged,
    onWillDeleteFiles,
    showMoreResults,
    onCompeletionAccepted,
    toggleWebview,
    selectPreviousCompletion,
    selectNextCompletion
  );
}

export function deactivate() {}
