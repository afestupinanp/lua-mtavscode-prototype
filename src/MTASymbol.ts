import * as vscode from 'vscode';
import Utils from './Utils';
/**
 * This class is in charge of reading the filePath that is given in the constructor, in order to create
 * the MTA autocomplete elements.
 */
export class MTASymbol {
    private unparsedSymbol: Object;
    // ---------- This markdown string contains all of the variables below. --------
    public mdString: vscode.MarkdownString;

    public name: string;
    public parentClass: string;
    public type: string = "method";
    public scriptSide: string = "shared";
    public sourceElement: string = "root"; // has effect only when type === "event"

    public description: string = "";
    public docString: string = "";
    public parameters: Array<Object>;
    public oopParameters: Array<Object>;
    public mtaWiki: string = "";

    public isOOPStatic: boolean = false; // has effect only when type === "method"
    public oopName: string = ""; // has effect only when type === "method"

    public isDeprecated: boolean = false;
    public isCancellable: boolean = false; // has effect only when type === "event"

    public methodSignature: string;
    public oopMethodSignature: string;
    // ----------------------------------
    
    public insertText: string;
    public insertTextOOP: string;

    public constructor(symbolObject: Object, symbolName: string, parentClass:string) {
        this.unparsedSymbol = symbolObject;
        this.name = symbolName;
        this.parentClass = parentClass;
        // Read from the JSON loaded file.
        this.parseObject();
    }

    private parseObject() {
        let object: Object = this.unparsedSymbol;
        
        this.type = object.type;
        this.scriptSide = object.available;
        this.description = object.description;
        this.isCancellable = object.cancellable;
        this.isDeprecated = object.deprecated;
        
        this.parameters = object.parameters;
        
        this.sourceElement = object.sourceElement;
        
        if (object.oop) {
            this.isOOPStatic = object.oop.static;
            this.oopName = object.oop.method;
            this.oopParameters = object.parameters.filter((param, index) => !(index === 0 && param.name.includes(this.parentClass)));
        }
        
        this.generateMethodSignature();
        this.generateOOPSignature();
        this.generateMTAURL();
        this.generateDocumentationString();
        this.generateMarkdownString();

        this.generateInsertText();
        this.generateInsertText(true);
    }
    
    private generateMethodSignature(): string {
        let signature: string = "```";
        if (this.type === "method") {
            signature = `${signature}${this.name}(`;
            if (this.parameters != undefined) {
                this.parameters.forEach((param, index) => {
                    let comma = index === (this.parameters.length - 1) ? "" : ", ";
                    let parameter = `${param.type} ${param.name}`;
                    if (param.value) {
                        parameter = `${parameter} = ${param.value}`;
                    }
                    signature = signature + `${parameter}${comma}`;
                });
            }
        } else {
            signature = signature + `addEventHandler("${this.name}", ${this.sourceElement}, function()...`;
        }
        signature = signature + ")```\n\n";

        if (this.sourceElement != undefined && this.type === "event") {
            signature = signature + "**Event source**:\n\nThe source of this event is the **" + this.sourceElement + "** element.\n\n";
        }
        
        this.methodSignature = signature;
        return this.methodSignature;
    }

    private generateOOPSignature(): string {
        if (this.type === "method") {
            let signature: string = "```";
            if (this.isOOPStatic) {
                let realOOPName = "";
                let realParent = this.parentClass;
                realParent = Utils.firstLetterUpper(this.parentClass);
                if (this.oopName) {
                    realOOPName = "." + this.oopName;
                }
                signature = `${signature}${realParent}${realOOPName}(`;
            } else{ 
                signature = `${signature}${this.parentClass}:${this.oopName}(`;
            }

            if (this.oopParameters != undefined) {
                this.oopParameters.forEach((param, index) => {
                    let comma = index === (this.oopParameters.length - 1) ? "" : ", ";
                    let parameter = `${param.type} ${param.name}`;
                    if (param.value) {
                        parameter = `${parameter} = ${param.value}`;
                    }
                    signature = signature + `${parameter}${comma}`;
                });
            }
            signature = signature + ")```\n\n";
            this.oopMethodSignature = signature;
        }
        return this.oopMethodSignature;
    }

    private generateInsertText(oop: boolean = false): string {
        let insertText: string = "";
        let usableParameters: Array<Object> = this.parameters;
        let className: string = this.parentClass;

        if (oop) {
            usableParameters = this.oopParameters;
            if (this.isOOPStatic) {
                className = Utils.firstLetterUpper(className);
            }
        }

        if (this.type === "method") {
            if (oop) {
                let separator = ":";
                let afterSeparator = "";
                if (this.isOOPStatic) {
                    separator = this.oopName ? "." : "";
                    afterSeparator = this.oopName ?? "";
                }
                insertText = `${className}${separator}${afterSeparator}(`;
            } else {
                insertText = `${this.name}(`;
            }

            if (usableParameters != undefined) {
                usableParameters.forEach((param, index) => {
                    // autocomplete only the required parameters.
                    if (!param.value) {
                        let comma = index === (usableParameters.length - 1) ? "" : ", ";
                        let parameter = `$\{${index}:${param.type + " " + param.name}\}`;
                        insertText = insertText + `${parameter}${comma}`;
                    }
                });
            }
            insertText = insertText + ")";
        } else {
            insertText = `addEventHandler("${this.name}", ${this.sourceElement}, function()\n\t$0\n)`;
        }

        if (oop) {
            this.insertTextOOP = insertText;
            return this.insertTextOOP
        }

        this.insertText = insertText;
        return this.insertText;
    }

    private generateMTAURL(): void {
        this.mtaWiki = "https://wiki.multitheftauto.com/wiki/" + this.name;
    }

    /**
     * This method allows to generate the markdown string, knowing that we have
     * the document string (docString) defined.
     * @returns This method returns a MarkdownString.
     */
    private generateMarkdownString(): vscode.MarkdownString {
        this.mdString = new vscode.MarkdownString(this.docString, true);
        return this.mdString;
    }

    /**
     * This method allows to generate the documentation string, which includes the description
     * of the symbol, the signature of the symbol, link to the MTA Wiki, and more.
     */
    private generateDocumentationString(): string {
        let mtaWikiMD = `[MTA Wiki ref.](${this.mtaWiki})`;
        let descriptionMD = `**Description \(${mtaWikiMD}\):**\n\n${this.description}`;
        let oopDesc = "";

        if (this.isDeprecated) {
            descriptionMD = "**This symbol is deprecated and it may be removed from future MTA SA versions.**\n\n" + descriptionMD;
        }

        if (this.type === "method") {
            if (this.parentClass) {
                let oopMethod = "";
                if (this.isOOPStatic) {
                    oopDesc = "**OOP (static method):**\n\n";
                } else {
                    oopDesc = "**OOP (non-static method):**\n\n";
                }
                oopDesc = oopDesc + oopMethod + this.oopMethodSignature + "\n\n";
            }
        }

        let cancellableStr: string = "";
        if (!this.isCancellable && this.type === "event") {
            cancellableStr = "\n\n**This event cannot be cancelled.**";
        }
        
        this.docString = this.methodSignature + oopDesc + "\n\n" + descriptionMD + cancellableStr;
        return this.docString;
    }

}