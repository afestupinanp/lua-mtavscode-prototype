import { writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const REGEX_SPLIT = /\w+\s+\w+/g;
const REGEX_OPTIONAL_PARAMS = /\[([^\]]+)\]/g;

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
const WIKI_EXTRACT_URLS = [
    'https://wiki.multitheftauto.com/wiki/Client_Scripting_Functions',
    // 'https://wiki.multitheftauto.com/wiki/Client_Scripting_Events',
    // 'https://wiki.multitheftauto.com/wiki/Server_Scripting_Functions',
    // 'https://wiki.multitheftauto.com/wiki/Server_Scripting_Events',
    // 'https://wiki.multitheftauto.com/wiki/Shared_Scripting_Functions'
];

/** Our results which will be written into a file. */
let results = {};
const __dirname = dirname(fileURLToPath(import.meta.url));


/**
 * This method extracts the required data from the URL article.
 * @param {string} functionName Function name we are going to extract from the wiki.
 * @return {Object} Returns an object that can be saved into JSON.
 */
export const getSymbolFromURL = async (functionName) => {
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
    const element = virtualDoc.window.document.querySelector("pre.prettyprint");
    const type = virtualDoc.window.document.querySelector("[name='headingclass']");
    return Promise.resolve({content: element.textContent?.trim(), type: type?.getAttribute("data-subcaption")});
}

/**
 * This method interprets the data from the Wiki and then sets it in an object which
 * can be stringified.
 * @param {string} result Original result, in plaintext format.
 * @returns {Object} Returns an object.
 */
export const interpretData = (result, config) => {
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
        ...config
    }

    return interpreted;
}

/**
 * This method appends the data into our results.
 * @param {Object} result Result data that we have generated
 */
const appendToResults = (result) => {
    const config = TYPE_AVAILABLE_MAP[result?.type] ?? {};
    let interpreted = interpretData(result?.content, config);

    results = {
        ...results,
        ...interpreted
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
 * This is the main method that generates the data into an output JSON file.
 * @returns {Promise} Returns a resolved promise.
 */
const generateData = async () => {
    for (const wikiUrl of WIKI_EXTRACT_URLS) {
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
                console.log(`[${wikiUrl}] Interpreting ${link.textContent}`);
                const uninterpreted = await getSymbolFromURL(link.textContent);
                appendToResults(uninterpreted);
                count++;
                console.log(`[${wikiUrl}] Done. Result appended to results array. Current: ${count}/${linkCount}`);
                // To avoid rate limits.
                await sleep(1500);
            }
            console.log(`[${wikiUrl}] List complete. Current: ${currentListLinkCount}/${linkListCount}`);
        }
    }
    writeFile();
    return Promise.resolve(results);
}

/**
 * This method writes into the disk the results.
 */
const writeFile = () => {
    console.log(`[GENERAL] Writing into results.`);
    writeFileSync(`${__dirname}/src/symbols/generated.json`, JSON.stringify(results));
    console.log(`[GENERAL] Done.`);
}

// Output the current data in results if interrupted.
process.on('SIGINT', () => {
    console.log('[GENERAL] Interrupt signal received.');
    console.log(results);
    writeFile();
    process.exit(1);
});

generateData();

/**
 * pages to review:
 * https://wiki.multitheftauto.com/wiki/OutputChatBox
 * 
 */