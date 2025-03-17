import { JSDOM } from 'jsdom';
import { writeFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE_URL_WIKI = 'https://wiki.multitheftauto.com';
const RATE_LIMIT_MS = 900;

const REGEX_SPLIT = /\w+\s+\w+/g;
const REGEX_OPTIONAL_PARAMS = /\[([^\]]+)\]/g;

const CRAWL_URLS = {
    'https://wiki.multitheftauto.com/wiki/Client_Scripting_Events': 'Client-side event',
    'https://wiki.multitheftauto.com/wiki/Server_Scripting_Events': 'Server-side event',
    'https://wiki.multitheftauto.com/wiki/Shared_Scripting_Functions': 'Shared function',
    'https://wiki.multitheftauto.com/wiki/Client_Scripting_Functions': 'Client-side function',
    'https://wiki.multitheftauto.com/wiki/Server_Scripting_Functions': 'Server-side function',
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const FINISHED_FILE_PATH = '../src/symbols/generated.json';
const PARTIAL_FILE_PATH = '../src/symbols/unfinished.json';

let results = {};
let finished = false;
let startTime = null;

/**
 * This method saves the results into a JSON file.
 */
const saveResults = () => {
    const pathNameJson = `${__dirname}/${finished ? FINISHED_FILE_PATH : PARTIAL_FILE_PATH}`;
    const fileConfig = {
        encoding: 'utf8'
    };
    const stringified = JSON.stringify(results);
    log('INFO', `Writing to ${pathNameJson}`);
    writeFileSync(pathNameJson, stringified, fileConfig);
}

/**
 * This method determines the scriptside availability from the function/event.
 * @param {string} categories Categories string.
 */
const determineSymbolTypeAndAvailability = (categories) => {
    const typeChecks = {
        'Shared function': {type: 'method', available: 'shared'},
        'Client function': {type: 'method', available: 'client'},
        'Server function': {type: 'method', available: 'server'},
        'Shared event': {type: 'event', available: 'shared'},
        'Client event': {type: 'event', available: 'client'},
        'Server event': {type: 'event', available: 'server'},
    };

    let result = {type: undefined, available: undefined};
    const iterable = Object.entries(typeChecks);
    for (const [check, map] of iterable) {
        if (categories.includes(check)) {
            result = map;
            break;
        }
    }
    return result;
}

/**
 * This method checks if it includes the template deprecated, which is used to set if the function/event is deprecated.
 * @param {string} categories 
 * @returns {Boolean} Returns a boolean indicating if it's deprecated or not.
 */
const determineIfSymbolDeprecated = (categories) => {
    return categories.includes("Template:Deprecated (view source)");
}

/**
 * This method parses the sections from the editable textarea. Each title has the following syntax: ==Title==. Subtitles are ===Subtitle===. This ain't perfect,
 * because a bunch of pages have some (what I consider) critical parts as subtitles instead of titles, and viceversa. It is a mess, but that is from the Wiki :(.
 * @param {string} content Textarea edit content.
 * @returns 
 */
const parseSections = (content) => {
    const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
    const sections = [];
    let currentSection = { title: "", content: [] };
    let currentSubsection = null;

    lines.forEach(line => {
        let titleMatch = line.match(/^==([^=]+)==$/);
        let subtitleMatch = line.match(/^===([^=]+)===$/);

        if (titleMatch) {
            // Store the previous section
            if (currentSection.title || currentSection.content.length) {
                sections.push(currentSection);
            }
            // Start a new section
            currentSection = { title: titleMatch[1].trim(), content: [], subsections: [] };
            currentSubsection = null; // Reset subsection
        } else if (subtitleMatch) {
            // Start a new subsection
            currentSubsection = { subtitle: subtitleMatch[1].trim(), content: [] };
            currentSection.subsections.push(currentSubsection);
        } else {
            // Add content to the current section or subsection
            if (currentSubsection) {
                currentSubsection.content.push(line);
            } else {
                currentSection.content.push(line);
            }
        }
    });

    // Push the last section
    if (currentSection.title || currentSection.content.length) {
        sections.push(currentSection);
    }

    return sections;
}

/**
 * This method gets the syntax off of the <syntaxhighelement /> tag. 
 * @param {string} cleanText
 * @returns {Object} Returns an object with the obtained parameters and return type.
 */
const splitParameters = (cleanText) => {
    const splittedWords = cleanText?.match(REGEX_SPLIT) ?? [];
    const optionalParams = cleanText?.match(REGEX_OPTIONAL_PARAMS) ?? []; // At max it will only contain 1 item.
    let interpreted = {};

    console.log(splittedWords);
    splittedWords.forEach((param, index) => {
        // We first split using spaces.
        const splittedData = param.split(" ");

        // first iteration corresponds to the type and function name.
        if (index == 0) {
            interpreted = {
                returnType: splittedData[0],
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
                                log('WARN', `Optional param likely missing default value from the Wiki. To check, and if it is really missing, report this to the devs?`);
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
            interpreted = {
                ...interpreted,
                parameters: [
                    ...interpreted.parameters,
                    param
                ]
            }
        }
    });
    return interpreted;    
}

/**
 * This method gets the parameters off of an article. It ain't perfect because we need to check if the name is syntax or parameters.
 * @param {string} pageName Name of the article. Should be the name of the function, basically.
 * @param {string} content Textarea edit content.
 * @returns 
 */
const getParameters = (pageName, content) => {
    let sections = parseSections(content);
    const syntaxSection = sections?.find((section) => section?.title == 'Syntax' || section?.title == 'Parameters');
    if (!syntaxSection) {
        log('WARN', `No parameters found for symbol ${pageName}.`);
        return {};
    }
    
    /**
     * We check on index 1 and index 0, in that respective order because for some reason it can be on a separate line, or all in the same line.
     * Example:
     * <syntaxhighlight lang="lua">bool givePedWeapon ( ped thePed, int weapon [, int ammo=30, bool setAsCurrent=false ] )</syntaxhighlight> 
     * or
     * <syntaxhighlight lang="lua">
     *  bool givePedWeapon ( ped thePed, int weapon [, int ammo=30, bool setAsCurrent=false ] )
     * </syntaxhighlight> 
     */

    const textContent = syntaxSection?.content[1]?.includes(pageName) ? syntaxSection?.content[1] : syntaxSection?.content[0];
    if (textContent.includes('No parameters') || textContent.includes('This event has no parameters')) {
        return {};
    }

    let cleanText = new JSDOM(textContent).window.document.body.textContent;
    cleanText = cleanText.replace(/<\/?[^>]+(>|$)/g, "");
    
    const parameters = splitParameters(cleanText);
    return parameters;
}

/**
 * This method gets the description of the page. We filter the whole page and get the section that is specific
 * for the description. We then clean the description, removing extra elements.
 * @param {string} content Textarea edit content.
 * @returns {string}
 */
const getDescription = (content) => {
    let sections = parseSections(content);
    // the description is a section without any titles.
    const descriptionSection = sections.find((section) => section.title == '');
    let descriptionLines = descriptionSection?.content ?? [];
    
    // We'll parse the description.
    descriptionLines = descriptionLines.map((line) => {
        if (line == '__NOTOC__') {
            return null;
        }

        // Removing category headers.
        line = line.replace('{{Shared function}}', '');
        line = line.replace('{{Shared event}}', '');
        line = line.replace('{{Shared_event}}', '');
        line = line.replace('{{Shared_function}}', '');
        line = line.replace('{{Server client function}}', '');
        line = line.replace('{{Server event}}', '');
        line = line.replace('{{Server_event}}', '');
        line = line.replace('{{Client function}}', '');
        line = line.replace('{{Client event}}', '');
        line = line.replace('{{Client_event}}', '');
        line = line.replace('{{Needs_Example}}', '');

        // Replacing note headers with notes in description.
        line = line.replace(/\{\{Note\|(.*?)\}\}/, '* **Note:** $1');

        // Replace triple quotes with Markdown style bold
        line = line.replace(/'''(.*?)'''/g, '*$1*');

        // Replacing square bracket links with Markdown style URLs.
        line = line.replace(/\[\[(.*?)\]\]/g, (_, name) => `[${name}](${BASE_URL_WIKI}/wiki/${name})`);
        return line;
    });

    descriptionLines = descriptionLines.filter(Boolean);

    console.log(descriptionLines);
    return descriptionLines.join('\n\n');
}

/**
 * This method gets the source element. Not the best method, however, there are are no other
 * ways to check from the edit page the source element.
 * @param {string} content  Textarea edit content.
 */
const getSourceElement = (content) => {
    let sections = parseSections(content);
    const sourceSection = sections.find((section) => section.title == 'Source');
    if (!sourceSection) {
        return undefined;
    }
    return sourceSection?.content?.includes('root') ? 'root' : 'resourceRoot';
}

/**
 * This function determines by search in the whole page if the event is cancellable. Not the best method, however, there are no other
 * ways to check from the edit page that it is not cancellable.
 * @param {string} content Textarea edit content.
 * @returns 
 */
const determineIsCancellable = (content) => {
    const cancellableStrings = ['is not cancellable', 'can not be cancelled', 'cannot be cancelled', 'cant\'t be cancelled'];
    return cancellableStrings.every((compare) => !content.includes(compare));
}

/**
 * This method does the parsing of the article. We call each component inside of it.
 * @param {string} pageName Name of the page/wiki article. Normally the name of the function.
 * @param {JSDOM} result JSDOM element we created in the function getPageData
 * @returns {Object} We return an object that contains the necessary items.
 */
const parsePageData = (pageName, result) => {
    const content = result.window.document.querySelector('#wpTextbox1')?.innerHTML ?? '';
    if (!content) {
        log('WARN', 'Page is empty. Skipping.');
        return;
    }

    const categories = [...result.window.document.querySelectorAll('.templatesUsed ul li') ?? []]?.map((listItem) => listItem?.textContent).join(' ');
    const {type, available} = determineSymbolTypeAndAvailability(categories);
    const deprecated = determineIfSymbolDeprecated(categories);
    const parameters = getParameters(pageName, content);
    const description = getDescription(content);
    const sourceElement = getSourceElement(content);
    const cancellable = determineIsCancellable(content);

    return {
        [pageName]: {
            description,
            ...parameters,
            type,
            available,
            deprecated,
            sourceElement,
            cancellable
        }
    }

}

/**
 * This method gets the data of a page by making a GET request to it.
 * @param {string} path 
 * @returns {Promise<JSDOM>}
 */
const getPageData = async (path) => {
    const response = await fetch(`${BASE_URL_WIKI}/wiki/${path}?action=edit`);
    if (response.status != 200) {
        return Promise.reject(response);
    }

    const data = await response?.text();
    if (!data?.length) {
        return Promise.reject(data);
    }

    const virtualDoc = new JSDOM(data);
    return Promise.resolve(virtualDoc);
}

/**
 * This method allows crawling through the categories in the categories page. Each category has a list with items. Each item
 * is a symbol, either a method or an event.
 * @returns 
 */
const crawlCategory = async () => {
    const urls = Object.entries(CRAWL_URLS);

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
            log('INFO', `[${wikiUrl}] Starting list ${currentListLinkCount}/${linkListCount}`);
            for (const link of links) {
                count++;
                const response = await runProcessOnPage(link?.textContent);
                if (response) {
                    log(`INFO]`, `[${wikiUrl}] Done. Result appended to results array. Current: ${count}/${linkCount}`);
                    // To avoid rate limits.
                    await sleep(RATE_LIMIT_MS);
                }
            }
            console.log(`[INFO][${wikiUrl}] List complete. Current: ${currentListLinkCount}/${linkListCount}`);
        }
    }
}

/**
 * This method allows logging to the console.
 * @param {string} level Log level.
 * @param {string} text Text to be output.
 * @returns 
 */
const log = (level, text) => {
    const output = `[${level}] ${text}`;
    if (level == 'WARN') { console.warn(output); return; }
    if (level == 'ERROR') { console.error(output); return; }
    if (level == 'INFO') { console.info(output); return; }
    if (level == 'DEBUG') { console.debug(output); return; }
}

/**
 * This method just sleeps... yeah.
 * @param {number} ms Miliseconds to sleep for.
 * @returns {Promise} Returns a promise, but it's not used.
 */
const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const runProcessOnPage = async (pageName) => {
    log('INFO', `Running on ${pageName}`);
    const result = await getPageData(pageName);
    if (result) {
        const parsedData = parsePageData(pageName, result);
        results = {
            ...results,
            ...parsedData
        };
    }
    return true;
}

/**
 * Main entrypoint function.
 */
const main = async () => {
    console.clear();
    startTime = new Date();
    log('INFO', 'Starting process.');
    const parameters = process.argv.slice(2) ?? [];
    try {
        if (!parameters.length) {
            log('INFO', 'Crawling categories.');
            await crawlCategory();
            finished = true;
        } else {
            log('INFO', 'Getting information from the following pages: ' + parameters.join(','));
            for (const pageName of parameters) {
                await runProcessOnPage(pageName);
                // Sleep to avoid rate limit.
                await sleep(RATE_LIMIT_MS);
            }
            finished = true;
        }
    } catch (error) {
        console.trace(error);
        finished = false;
    } finally {
        saveResults();
    }
}

process.on("exit", (code) => {
    const current = Date.now();
    const value = (current - startTime) / 1000;
    log('INFO', `Process finished with status ${code} in ${value.toFixed(2)} seconds.`);
});

// Output the current data in results if interrupted.
process.on('SIGINT', () => {
    finished = false;
    saveResults();
    process.exit(1);
});

process.on("uncaughtException", (error) => {
    console.clear();
    console.error('[ERROR] Uncaught exception');
    console.error(`[ERROR] ${error}`);
    console.error(error.stack);
    finished = false;
    saveResults();
    process.exit(2);
});

await main();