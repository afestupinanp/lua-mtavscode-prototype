import { writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import TurndownService from 'turndown';

const REGEX_SPLIT = /\w+\s+\w+/g;
const REGEX_OPTIONAL_PARAMS = /\[([^\]]+)\]/g;
const WIKI_HREF_REPLACE_REGEX = /href="\/wiki\/(.*?)"/g;

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
    'https://wiki.multitheftauto.com/wiki/Client_Scripting_Functions': 'client',
    // 'https://wiki.multitheftauto.com/wiki/Client_Scripting_Events': 'client',
    // 'https://wiki.multitheftauto.com/wiki/Server_Scripting_Functions': 'server',
    // 'https://wiki.multitheftauto.com/wiki/Server_Scripting_Events': 'server',
    // 'https://wiki.multitheftauto.com/wiki/Shared_Scripting_Functions: 'shared'
};

/** Our results which will be written into a file. */
let results = {};
const __dirname = dirname(fileURLToPath(import.meta.url));


/**
 * This method extracts the required data from the URL article.
 * @param {string} functionName Function name we are going to extract from the wiki.
 * @return {Object} Returns an object that can be saved into JSON.
 */
export const getSymbolFromURL = async (functionName, desiredType) => {
    const wikiBaseURL = "https://wiki.multitheftauto.com/wiki";
    const url = `${wikiBaseURL}/${functionName}`;

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
    
    let element = virtualDoc.window.document.querySelector(querySelectorElement);
    let description = '';
    let deprecated = false;

    const type = virtualDoc.window.document.querySelector("[name='headingclass']");
    const mainContent = virtualDoc.window.document.querySelector('.mw-parser-output');
    const categories = virtualDoc.window.document.querySelector('#mw-normal-catlinks');

    Array.from(mainContent.querySelectorAll('p')).forEach(p => {
        const h2 = mainContent.querySelector('h2');
        if (h2 && p.compareDocumentPosition(h2) & 4) {
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

    if (categories && categories.querySelector(`a[href='${DEPRECATED_URL}']`)) {
        deprecated = true;
    }

    const desiredAvailability = TYPE_AVAILABLE_MAP[desiredType];
    if (desiredAvailability && desiredType == 'shared') {
        element = virtualDoc.window.document.querySelector(`.serverContent ${querySelectorElement}`);
    }

    return Promise.resolve({content: element.textContent?.trim(), type: type?.getAttribute("data-subcaption"), description, deprecated});
}

/**
 * This method interprets the data from the Wiki and then sets it in an object which
 * can be stringified.
 * @param {string} result Original result, in plaintext format.
 * @returns {Object} Returns an object.
 */
export const interpretData = (result, description, deprecated, config) => {
    console.log(result);
    const splittedWords = result.match(REGEX_SPLIT);
    const optionalParams = result.match(REGEX_OPTIONAL_PARAMS); // At max it will only contain 1 item.
    const interpreted = {};

    let functionName = "";
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
const generateData = async (functionName = null, type = null) => {
    const generateFromCategories = async () => {
        const urls = Object.entries(WIKI_EXTRACT_URLS);

        for (const [wikiUrl, desiredType] of urls) {
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
                    generate(link?.textContent, desiredType, wikiUrl);
                    count++;
                    console.log(`[${wikiUrl}] Done. Result appended to results array. Current: ${count}/${linkCount}`);
                    // To avoid rate limits.
                    await sleep(RATE_LIMIT_MS);
                }
                console.log(`[${wikiUrl}] List complete. Current: ${currentListLinkCount}/${linkListCount}`);
            }
        }
    }

    const generate = async (name, type, wikiUrl = null) => {
        console.log(`[${wikiUrl ?? name}] Interpreting ${name}`);
        const uninterpreted = await getSymbolFromURL(name, type);
        appendToResults(uninterpreted);
    }

    if (functionName && type) {
        await generateFromCategories();
    } else {
        await generate(functionName, type);
    }

    writeFile();
    return Promise.resolve(results);
}

/**
 * This method writes into the disk the results.
 */
const writeFile = (name = 'generated') => {
    const pathName = `${__dirname}/src/symbols/${name}.json`;
    console.log(`[GENERAL] Writing to ${pathName}`);
    writeFileSync(pathName, JSON.stringify(results));
    console.log(`[GENERAL] Done.`);
}

// Output the current data in results if interrupted.
process.on('SIGINT', () => {
    console.log('[GENERAL] Interrupt signal received.');
    writeFile();
    process.exit(1);
});

process.on("uncaughtException", (error) => {
    console.error('[GENERAL] Uncaught exception');
    console.error(`[GENERAL] ${error}`);
    console.error(error.stack);
    writeFile('unfinished');
    process.exit(1);
});


generateData('shutdown');

/**
 * pages to review:
 * https://wiki.multitheftauto.com/wiki/OutputChatBox
 * 
 */