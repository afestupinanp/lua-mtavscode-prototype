# Lua MTA VScode (preview)

[![Build](https://github.com/afestupinanp/lua-mtavscode-prototype/actions/workflows/build.yml/badge.svg)](https://github.com/afestupinanp/lua-mtavscode-prototype/actions/workflows/build.yml)


Lua MTA VScode is an extension for Visual Studio Code editor to add code completion support, snippets, commands and more for the [Multi Theft Auto San Andreas](https://mtasa.com) modification.

## Features

### Code completion support

Lua MTA VScode comes with autocomplete, hover and signature providers for various symbols that belong to MTA San Andreas. The extension can be customized to differentitate between client, server and sharedside symbols, allowing you to see the only the ones that are available for the scriptside you are dealing with. This setting can be customized, allowing special keywords to be used to differentiate both scriptsides, by default, it uses the c_ and s_ syntaxes, as well as looking for "server" and "client" words in the file.

![luamtavscode-usage](https://github.com/user-attachments/assets/35057eeb-2281-46e1-83d5-dba7de29c802)

Please note, this is not a full LSP, which means, it doesn't have detection for variables, custom functions, and other general features of a LSP.

Every autocomplete and hover item describes what does the method do, its parameters, as well as a link to the [MTA Wiki](https://wiki.multitheftauto.com) for full reference!

For the meta.xml file, Lua MTA VScode also provides snippets for autocompletion, with a little description.

### Useful snippets

This extension provides useful snippets for coding your resource, for example, create a command handler, add a custom event and more!

### Project scaffolding

![luamtavscode-scaffold](https://github.com/user-attachments/assets/22576571-f1d4-48ed-ba22-a352963978e0)


This extension adds the ability to scaffold a resource from the get go, simply call the respective command (`Lua MTAVScode: Scaffold a new resource`) and you will be able to generate a simple project from the get go. If you also have git configured, you can also create a new. It will also initialize a git repo if needed.

## Settings

The extension has the following settings:

* ``lua-mtavscode.serverSideFileKeywords``: This setting allows the extension to scan the filename to determine if it belongs to a serverside script. It's an array of strings, and by default, it has the following: ``_s, server``.
* ``lua-mtavscode.clientSideFileKeywords``: This setting allows the extension to scan the filename to determine if it belongs to a clientside script. It's an array of strings, and by default, it has the following: ``_c, client``.
