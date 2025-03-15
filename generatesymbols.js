import { existsSync, readFileSync, writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import TurndownService from 'turndown';
import { gzip } from 'zlib';
import { createInterface } from 'readline';

const REGEX_SPLIT = /\w+\s+\w+/g;
const REGEX_OPTIONAL_PARAMS = /\[([^\]]+)\]/g;
const WIKI_HREF_REPLACE_REGEX = /href="\/wiki\/(.*?)"/g;

const NODE_DOCUMENT_POSITION_BEFORE = 2; // Node.DOCUMENT_POSITION_PRECEDING
const NODE_DOCUMENT_POSITION_AFTER = 4; // Node.DOCUMENT_POSITION_FOLLOWING

const BASE_URL_WIKI = 'https://wiki.multitheftauto.com';
const RATE_LIMIT_MS = 1500;
const DEPRECATED_URL = '/wiki/Category:Deprecated';

const turndownService = new TurndownService();

/** Simple mapping for the type and availability. */
const TYPE_AVAILABLE_MAP = {
    'Shared function': {
        'type': 'method',
        'available': 'shared'
    },
    'Shared event': {
        'type': 'event',
        'available': 'shared'
    },
    'Client-side function': {
        'type': 'method',
        'available': 'client'
    },
    'Client-side event': {
        'type': 'event',
        'available': 'client'
    },
    'Server-side function': {
        'type': 'method',
        'available': 'server'
    },
    'Server-side event': {
        'type': 'event',
        'available': 'server'
    }
}

/** These are all the categories from the Wiki pages. */
const WIKI_EXTRACT_URLS = {
    'https://wiki.multitheftauto.com/wiki/Client_Scripting_Functions': 'Client-side function',
    // 'https://wiki.multitheftauto.com/wiki/Client_Scripting_Events': 'Client-side event',
    // 'https://wiki.multitheftauto.com/wiki/Server_Scripting_Functions': 'Server-side function',
    // 'https://wiki.multitheftauto.com/wiki/Server_Scripting_Events': 'Server-side event',
    // 'https://wiki.multitheftauto.com/wiki/Shared_Scripting_Functions: 'Shared function'
};

/** Our results which will be written into a file. */
let results = {};
const __dirname = dirname(fileURLToPath(import.meta.url));


/**
 * This method extracts the required data from the URL article.
 * @param {string} functionName Function name we are going to extract from the wiki.
 * @return {Object} Returns an object that can be saved into JSON.
 */
export const getSymbolFromURL = async (functionName) => {
    const url = `${BASE_URL_WIKI}/wiki/${functionName}`;

    const response = await fetch(url);
    if (response.status != 200) {
        return Promise.reject(response);
    }

    const data = await response?.text();
    if (!data?.length) {
        return Promise.reject(data);
    }

    const virtualDoc = new JSDOM(data);
    const querySelectorElement = 'pre.prettyprint';
    
    let description = '';
    let deprecated = false;

    const type = virtualDoc.window.document.querySelector("[name='headingclass']");
    const desiredType = type?.getAttribute("data-subcaption");
    const mainContent = virtualDoc.window.document.querySelector('.mw-parser-output');
    const categories = virtualDoc.window.document.querySelector('#mw-normal-catlinks');
    const h2Example = Array.from(virtualDoc.window.document.querySelectorAll('h2')).find((el) => el.textContent == 'Example');
    
    let element = mainContent.querySelector(`:scope > ${querySelectorElement}`);

    // Check if server element exists.
    const serverElements = virtualDoc.window.document.querySelectorAll('.serverHeader');
    let serverElement = null;
    const clientElements = virtualDoc.window.document.querySelectorAll('.clientHeader');
    let clientElement = null;

    if (serverElements?.length) {
        serverElement = Array.from(serverElements).reduce((acc, current) => {
            if (current.compareDocumentPosition(h2Example) & NODE_DOCUMENT_POSITION_BEFORE) {
                acc = current;
            }
            return acc;
        });
    }

    if (clientElements?.length) {
        clientElement = Array.from(clientElements).reduce((acc, current) => {
            if (current.compareDocumentPosition(h2Example) & NODE_DOCUMENT_POSITION_BEFORE) {
                acc = current;
            }
            return acc;
        });
    }


    // To get the description.
    Array.from(mainContent.querySelectorAll('p')).forEach(p => {
        const h2 = mainContent.querySelector('h2');
        if (h2 && p.compareDocumentPosition(h2) & NODE_DOCUMENT_POSITION_AFTER) {
            description = description + (p?.innerHTML ?? '');
        }
    });

    if (description?.length) {
        // Turn the links inside the description to use the wiki base URL
        description = description.replace(
            WIKI_HREF_REPLACE_REGEX,
            `href="${BASE_URL_WIKI}/wiki/$1"`
        );
        // Turn it to Markdown so it is interpreted by VSCode correctly.
        description = turndownService.turndown(description);
    }

    // Check if the event/method is deprecated by checking the categories
    if (categories && categories.querySelector(`a[href='${DEPRECATED_URL}']`)) {
        deprecated = true;
    }

    const desiredAvailability = TYPE_AVAILABLE_MAP[desiredType];
    if (desiredAvailability && desiredAvailability?.available == 'shared' && serverElement && clientElement) {
        element = virtualDoc.window.document.querySelector(`.serverContent ${querySelectorElement}`);
        description = '_Showing server-side parameters. Client-side may use different parameters, see MTA Wiki for full reference._\n\n' + description;
    }

    return Promise.resolve({content: element?.textContent?.trim(), type: desiredType, description, deprecated});
}

/**
 * This method interprets the data from the Wiki and then sets it in an object which
 * can be stringified.
 * @param {string} result Original result, in plaintext format.
 * @returns {Object} Returns an object.
 */
export const interpretData = (result, description, deprecated, config) => {
    const splittedWords = result.match(REGEX_SPLIT);
    const optionalParams = result.match(REGEX_OPTIONAL_PARAMS); // At max it will only contain 1 item.
    const interpreted = {};

    let functionName = "";
    console.log(splittedWords);
    splittedWords.forEach((param, idx) => {
        // We first split using spaces.
        const splittedData = param.split(" ");

        // first iteration corresponds to the type and function name.
        if (idx == 0) {
            functionName = splittedData[1];
            interpreted[functionName] = {
                type: splittedData[0],
                parameters: []
            }
        } else {
            // The rest are parameter iterations.
            let param = {
                type: splittedData[0],
                name: splittedData[1]
            };
            
            
            if (optionalParams?.length) {
                // We get the default values until the next comma, using the parameter we found. This will
                // include until the "=".
                const defaultValues = optionalParams[0]?.match(new RegExp(`${splittedData[1]}[^,]*`, 'g')) ?? [];
                if (defaultValues?.length) {
                    defaultValues.forEach((defaultValue) => {
                        if (defaultValue.includes(splittedData[1])) {
                            const splittedParam = defaultValue.split('=');
                            // Some articles for some reason lack the default value.
                            // Maybe report these to MTA devs?
                            if (splittedParam?.length === 1) {
                                console.warn(`[${functionName}]: Optional param likely missing default value from the Wiki. To check, and if it is really missing, report this to the devs?`);
                            } else {
                                console.log(splittedParam);
                                param = {
                                    ...param,
                                    value: splittedParam[1].replace(/[\[\]\s]+/g, '')
                                }
                            }

                        }
                    });
                }
            }

            // Append the data to the resulting object.
            interpreted[functionName] = {
                ...interpreted[functionName],
                parameters: [
                    ...interpreted[functionName]?.parameters,
                    param
                ]
            }
        }
    });
    
    // Append the config to the resulting object.
    interpreted[functionName] = {
        ...interpreted[functionName],
        ...config,
        description,
        deprecated
    }

    return interpreted;
}

/**
 * This method appends the data into our results.
 * @param {Object} result Result data that we have generated
 */
const appendToResults = (result) => {
    const config = TYPE_AVAILABLE_MAP[result?.type] ?? {};
    let interpreted = interpretData(result?.content, result?.description, result?.deprecated, config);

    results = {
        ...results,
        ...interpreted,
    };
}

/**
 * This method just sleeps... yeah.
 * @param {number} ms Miliseconds to sleep for.
 * @returns {Promise} Returns a promise, but it's not used.
 */
const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * This is the main method that generates the data into an output JSON file. Iterates over the categories
 * and for each article, makes a request to get all the associated wiki information.
 * @returns {Promise} Returns a resolved promise.
 */
const generateData = async (functionName = null) => {
    const generateFromCategories = async () => {
        const urls = Object.entries(WIKI_EXTRACT_URLS);

        for (const [wikiUrl] of urls) {
            const response = await fetch(wikiUrl);
            const data = await response?.text();
            if (!data) {
                console.log(`[${wikiUrl}]: no data found.`);
                return Promise.reject('No data.');
            }
            
            const domData = new JSDOM(data);
            const linkLists = domData.window.document.querySelectorAll("h2 + ul:not([class])");
            const linkListCount = linkLists?.length;
            let currentListLinkCount = 0;
            for (const ulList of linkLists) {
                currentListLinkCount++;
                const links = ulList.querySelectorAll('a:not(:has(span))');
                const linkCount = links?.length ?? 0;
                let count = 0;
                console.log(`[${wikiUrl}] Starting list ${currentListLinkCount}/${linkListCount}`);
                for (const link of links) {
                    count++;
                    const response = await generate(link?.textContent, wikiUrl);
                    if (response) {
                        console.log(`[${wikiUrl}] Done. Result appended to results array. Current: ${count}/${linkCount}`);
                        // To avoid rate limits.
                        await sleep(RATE_LIMIT_MS);
                    }
                }
                console.log(`[${wikiUrl}] List complete. Current: ${currentListLinkCount}/${linkListCount}`);
            }
        }
    }

    const generate = async (name, wikiUrl = null) => {
        console.log(`[${wikiUrl ?? name}] Interpreting ${name}`);
        if (name in results) {
            const message = `[${wikiUrl ?? name}] ${name} is already in main array of results. Skipping.`;
            console.log(message);
            return Promise.resolve(false);
        }

        const uninterpreted = await getSymbolFromURL(name);
        appendToResults(uninterpreted);
        return Promise.resolve(true);
    }

    if (functionName) {
        await generate(functionName);
    } else {
        await generateFromCategories();
    }

    writeFile();
    return Promise.resolve(results);
}

/**
 * This method writes into the disk the results.
 */
const writeFile = (name = 'generated') => {
    const pathNameJson = `${__dirname}/src/symbols/${name}.json`;
    const fileConfig = {
        encoding: 'utf8'
    };
    const stringified = JSON.stringify(results);
    console.log(`[GENERAL] Writing to ${pathNameJson}`);
    writeFileSync(pathNameJson, stringified, fileConfig);

    const current = Date.now();
    const value = (current - startTime) / 1000;
    console.log(`[GENERAL] Done. Process took ${value.toFixed(2)} seconds.`);
}

// Output the current data in results if interrupted.
process.on('SIGINT', () => {
    console.log('[GENERAL] Interrupt signal received.');
    writeFile('unfinished');
    process.exit(1);
});

process.on("uncaughtException", (error) => {
    console.error('[GENERAL] Uncaught exception');
    console.error(`[GENERAL] ${error}`);
    console.error(error.stack);
    writeFile('unfinished');
    process.exit(1);
});


const stdInterface = createInterface({
    input: process.stdin,
    output: process.stdout
})

// Track time used.
const startTime = Date.now();

/**
 * Main entry function.
 * @param {string|null} answer 
 */
const main = (answer) => {
    if (answer.toLowerCase() == 'yes' || answer == 'y' || !answer) {
        let pathNameJson = `${__dirname}/src/symbols/generated.json`;
        if (!existsSync(pathNameJson)) {
            pathNameJson = `${__dirname}/src/symbols/unfinished.json`;
            if (!existsSync(pathNameJson)) {
                pathNameJson = null;
            }
        }

        if (pathNameJson) {
            const stream = readFileSync(pathNameJson, 'utf8');
            results = JSON.parse(stream);
        }
    }
    console.clear();
    generateData();
}

console.clear();
console.log(`[GENERAL] Process started`);
stdInterface.question(`[GENERAL] Would you like to start the process from scratch, or load the existing JSON? (Y/n): `, main);


/**
 * TODO: pages to review - these ones have a different structure, or have two code sections.
 * https://wiki.multitheftauto.com/wiki/OutputChatBox
 * https://wiki.multitheftauto.com/wiki/ProcessLineOfSight
 * 
 */