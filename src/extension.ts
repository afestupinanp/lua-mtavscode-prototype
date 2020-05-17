// Import the vscode extension API.
import * as vscode from 'vscode';
import { MTAClass } from './MTAClass';
import Utils from './Utils';

let classes: Array<MTAClass> = [];

/**
 * Method called when the extension has been activated. The extension is only activated when Lua files
 * that have the correct pattern to be used.
 * @param context The extension context.
 */
export function activate(context: vscode.ExtensionContext) {
	// debug
	vscode.window.showInformationMessage("lua-mtavscode is now running.");
	
	// Load all the classes.
	let classList: Array<string> = [
		"account",
		"player"
	];

	// And create the MTAClass object.
	classList.forEach((cls) => {
		let mtaClass: MTAClass = new MTAClass(cls);
		classes.push(mtaClass);
	});

	// Create the completion items aka the IntelliSense list.
	let completionItemProviderAll: vscode.Disposable = vscode.languages.registerCompletionItemProvider("lua", {
		provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
			// Create a completionItems list.
			let completionItems: vscode.CompletionList = new vscode.CompletionList();

			classes.forEach((mtaClass) => {
				let symbols = Object.entries(mtaClass.symbolList);
				symbols.forEach(([name, symbol]) => {
					let completionItem: any = createCompletionItem(symbol, false);
					if (completionItem) {
						completionItems.items.push(completionItem);
					}
				});
			});
			return completionItems;
		}
	}, "");
	context.subscriptions.push(completionItemProviderAll);

	// Create the completion items aka the IntelliSense list.
	// let completionItemProviderOOP: vscode.Disposable = vscode.languages.registerCompletionItemProvider("lua", {
	// 	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
	// 		// Create a completionItems list.
	// 		let completionItems: vscode.CompletionList = new vscode.CompletionList();

	// 		classes.forEach((mtaClass) => {
	// 			let symbols = Object.entries(mtaClass.symbolList);
	// 			symbols.forEach(([name, symbol]) => {
	// 				if (symbol.type === "method" && !symbol.isOOPStatic) {
	// 					let completionItem: any = createCompletionItem(symbol, true);
	// 					if (completionItem) {
	// 						completionItems.items.push(completionItem);
	// 					}
	// 				}
	// 			});
	// 		});
	// 		return completionItems;
	// 	}
	// }, ":");

	// context.subscriptions.push(completionItemProviderOOP);

	// // Create the completion items aka the IntelliSense list.
	// let completionItemProviderOOPStatic: vscode.Disposable = vscode.languages.registerCompletionItemProvider("lua", {
	// 	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
	// 		// Create a completionItems list.
	// 		let completionItems: vscode.CompletionList = new vscode.CompletionList();

	// 		classes.forEach((mtaClass) => {
	// 			let symbols = Object.entries(mtaClass.symbolList);
	// 			symbols.forEach(([name, symbol]) => {
	// 				if (symbol.type === "method" && symbol.isOOPStatic) {
	// 					let completionItem: any = createCompletionItem(symbol, true);
	// 					if (completionItem) {
	// 						completionItems.items.push(completionItem);
	// 					}
	// 				}
	// 			});
	// 		});
	// 		return completionItems;
	// 	}
	// }, ".");

	// context.subscriptions.push(completionItemProviderOOPStatic);
}

function createCompletionItem(mtaSymbol: any, oopOnly: boolean = false): vscode.CompletionItem|undefined {
	let itemKind: vscode.CompletionItemKind = vscode.CompletionItemKind.Method;
	let className: string = Utils.firstLetterUpper(mtaSymbol.parentClass);
	let symbolName: string = mtaSymbol.name;
	if (mtaSymbol.type === "method" && oopOnly) {
		if (mtaSymbol.isOOPStatic) {
			if (!mtaSymbol.oopName) {
				symbolName = className;
				itemKind = vscode.CompletionItemKind.Constructor;
			} else {
				symbolName = mtaSymbol.oopName;
			}
		} else {
			symbolName = mtaSymbol.oopName;
		}
	} else {
		if (mtaSymbol.type === "method") {
			itemKind = vscode.CompletionItemKind.Method;
			symbolName = mtaSymbol.name;
		} else {
			itemKind = vscode.CompletionItemKind.Event;
			symbolName = mtaSymbol.name;
		}
	}

	let completionItem: vscode.CompletionItem = new vscode.CompletionItem(symbolName, itemKind);
	completionItem.documentation = mtaSymbol.mdString;
	completionItem.insertText = new vscode.SnippetString(mtaSymbol.insertText);
	completionItem.detail = `${className} class - `;
	if (!mtaSymbol.oopName && mtaSymbol.type === "method") {
		completionItem.detail = completionItem.detail + "constructor ";
	}
	completionItem.detail = completionItem.detail + "" + mtaSymbol.type;

	if (mtaSymbol.isDeprecated) {
		let tags: ReadonlyArray<vscode.CompletionItemTag> = [vscode.CompletionItemTag.Deprecated];
		completionItem.tags = tags;
	}
	return completionItem;
}

/**
 * Method called when the extension deactivates.
 */
export function deactivate() {}