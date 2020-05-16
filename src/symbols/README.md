# Adding symbols
## How does it work?

Adding symbols is as simple as adding them into the JSON files, they will be automatically displayed for the user on the IntelliSense autocomplete and hover providers. You must, however, follow a syntax that allows the extension to load the JSON files.

This is an example, taken from the accounts.json "class":
```json
"getAccountPlayer": {
    "type": "method",
    "available": "server",
    "oop": {
        "static": false,
        "method": "getPlayer"
    },
    "deprecated": false,
    "description": "This function returns the player element that is currently using a specified account, i.e. is logged into it. Only one player can use an account at a time.",
    "parameters": [
        {
            "name": "theAccount",
            "type": "account"
        }
    ]
},
```

As you can see, the JSON follows an schema that allows the extension to understand the symbols. To define a symbol, you start with the name of it, as it is used, and then, you define the various properties available for it.

This schema can have the following attributes:

* ``type``: The type of symbol that you are adding, its values can be ``method`` or ``event``.
* ``available``: Where does this symbol belong to? Is it serverside, clientside or can it be used in both? The possible values for it are ``client``, ``server`` or ``shared``. An undefined value is parsed by default as ``shared``. It's very important to define this, as the extension can detect if the file belongs to a client or server script, it will display the available symbols for each scriptside.
* ``sourceElement``: Applicable only for events: This defines the source element used in the event, for example, the root element or the resourceRoot element.
* ``oop``: The OOP ([Object Oriented Programming](https://wiki.multitheftauto.com/wiki/OOP)) syntax for the symbol. This is only used whenever the symbol is a ``method``. The OOP attribute has the following sub attributes:
    * ``static``: Is the method static? Can it be accessed only with the class name? The possible values here are ``true`` or ``false``.
    * ``method``: What is the name of the method in the OOP syntax? This property can be undefined ONLY when the static property is true, which means, if this property is undefined, the class name will be displayed as the method (aka, the constructor).
* ``deprecated``: Is the method deprecated? The possible values are ``true`` or ``false``. By default, vscode-mta assumes symbols are never deprecated.
* ``description``: A description of this symbol, what does it do?
* ``parameters``: An array of objects that describe each parameter, for it to get displayed. **NOTE:** In the non static methods of OOP, the first parameter always refers to the instance of the class, so if the first parameter isn't displayed, it's because it was likely skipped. The parameter object can have the following properties:
    * ``name``: The name of the parameter.
    * ``type``: The type of the parameter.
    * ``value``: A default value for this parameter. If this property is defined, when the user selects an item from the autocomplete list, it will be displayed instead of the name of the parameter.

## How to add them to be loaded?
Finally, you'd add them in extension.ts, under the ``symbols`` constant:
```typescript
const symbols = {
	"Account": require("./symbols/accounts.json"),
    "Player": require("./symbols/player.json"),
    "yourNewClass": require("./symbols/yourJsonFile.json")
};
```