# lua-mtavscode

lua-mtavscode is an extension for Visual Studio Code editor to add IntelliSense support, snippets, commands and more for the [Multi Theft Auto San Andreas](https://mtasa.com) modification.

## Features

### IntelliSense support

lua-mtavscode comes with autocomplete, hover and signature providers for various symbols that belong to MTA San Andreas. The extension can be customized to differentitate between client, server and sharedside symbols, allowing you to see the only the ones that are available for the scriptside you are dealing with. This setting can be customized, allowing special keywords to be used to differentiate both scriptsides, by default, it uses the c_ and s_ syntaxes, as well as looking for "server" and "client" words in the file.

Every autocomplete and hover item describes what does the method do, its parameters, as well as a link to the [MTA Wiki](https://wiki.multitheftauto.com) for full reference!

For the meta.xml file, lua-mtavscode also provides snippets for autocompletion.

### Lua OOP

lua-mtavscode provides the signature for both the standard and the OOP ways to use a method. This can be customized to be disabled or enabled, by default, it will be enabled.

### Useful snippets

This extension provides useful snippets for coding your resource, for example, create a command handler, add a custom event and more!

### Project scaffolding

The vs-code extension adds the ability to scaffold a resource from the get go, simply with the press of a click!

## Settings

The extension has the following settings:

* ``lua-mtavscode.serverSideFileKeywords``: This setting allows the extension to scan the filename to determine if it belongs to a serverside script. It's an array of strings, and by default, it has the following: ``_s, server``.
* ``lua-mtavscode.clientSideFileKeywords``: This setting allows the extension to scan the filename to determine if it belongs to a clientside script. It's an array of strings, and by default, it has the following: ``_c, client``.
* ``lua-mtavscode.showMethodOOPSignature``: This setting allows the extension to show the OOP signatures for a method. It's a boolean, and by default, its value is ``true``.