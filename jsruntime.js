// version 1

/**
@typedef {string} Runtime
@enum {Runtime}
*/
const runtimes = {
    NODE: "NODE",
    BUN: "BUN",
    ASHELL: "ASHELL",
    //SCRIPTABLE: "SCRIPTABLE",
    BROWSER: "BROWSER",
    UNKNOWN: "UNKNOWN"
};

/**
Attempts to detect the currently used JavaScript engine/runtime; throws if the engine/runtime cannot be detected.
@returns {Runtime}
*/
function getRuntime() {
    try {
        if (jsc !== undefined)
            return runtimes.ASHELL;
    } catch (_) { }

    try {
        if (Bun !== undefined)
            return runtimes.BUN;
    } catch (_) { }

    /*
    try {
        if (args !== undefined)
            return runtimes.SCRIPTABLE;
    } catch (_) { }
    */

    try {
        if (process !== undefined)
            return runtimes.NODE;
    } catch (_) { }

    try {
        if (document !== undefined)
            return runtimes.BROWSER;
    } catch (_) { }

    throw new Error("cannot determine JavaScript runtime");
    //return runtimes.UNKNOWN;
}

/**
Returns user input
@param {string} msg
@returns {string | undefined}
*/
function getInput(msg = "") {
    const rt = getRuntime();
    switch (rt) {
        case runtimes.NODE:
            throw new Error("node input not inplemented");
        case runtimes.BUN:
        case runtimes.ASHELL:
        case runtimes.BROWSER:
            return prompt(msg);
    }

    return undefined;
}


/**
Returns user input
@param {string} path
@returns {string | undefined}
*/
function readFile(path) {
    const spath = path.split("/");
    const fname = spath[spath.length - 1];

    const rt = getRuntime();
    switch (rt) {
        case runtimes.NODE:
            const fs = require("fs");
            return fs.readFileSync(path);
        case runtimes.BUN:
            try {
                return Bun.file(path).text();
            } catch (_) { }
            return undefined;
        case runtimes.ASHELL:
            let content = jsc.readFile(path);
            let isErr = content === ``;
            //console.log(isErr);
            return isErr ? undefined : content;
        case runtimes.BROWSER:
            throw new Error("browser readfile not supported");
    }

    return undefined;
}


// how I have to export module items because of A-Shell nonsense
try {
    if (exports !== undefined) {
        exports.runtimes = runtimes;
        exports.getRuntime = getRuntime;
        exports.getInput = getInput;
        exports.readFile = readFile;
    }
} catch (_) { }
