const _imports = {};
try {
    _imports.jsruntime = require("./jsruntime.js");
} catch (_) {
    try {
        _imports.jsruntime = require("jsruntime");
    } catch (error) {
        throw new Error(`unable to load JSRuntime:\n${error}`);
    }
}

const jsruntime = _imports.jsruntime;



class JSLFunc {
    #code;
    #args;
    #ftype;
    /**
    @param {string[]} code
    @param {number} args
    @param {string} ftype
    */
    constructor(code, args, ftype = "NONE") {
        this.#code = code;
        this.#args = args;
        this.#ftype = ftype;
        this.isJSLFunction = true;
    }

    /**
    @returns {string}
    */
    ftype() {
        return this.#ftype;
    }

    /**
    @param {JSLStack} stack
    @param {JSLContext} context
    @param {map<string, any>} vars
    */
    run(stack, context, vars) {
        for (let i = 0; i < this.#args; i++) {
            vars.set(`$${i + 1}`, stack.pop());
        }

        let newVars = new Map();
        vars.forEach((v, k) => newVars.set(k, v));
        return interpretJSL(this.#code, newVars, context, 1);
    }
}



class JSLContainer {
    #template;

    /**
    @param {object} template
    */
    constructor(template) {
        this.#template = template;
        this.isJSLContainer = true;
    }

    new(stack, context, vars) {
        let newInstance = structuredClone(this.#template);
        for (let k in newInstance) {
            if (newInstance[k] === undefined) {

            }
        }
    }
}


/**
@typedef {{ln: number, col: number, parentcontext: JSLContext | undefined}} JSLContext
*/

/**
@param {number} ln
@param {number} col
@param {JSLContext | undefined} subcontext
@returns {JSLContext}
*/
function newJSLContext(ln, col = undefined, parentcontext = undefined) {
    return {
        ln: ln,
        col: col,
        parentcontext: parentcontext
    };
}

/**
@param {JSLContext} context
@param {string | undefined} msg
@returns string
*/
function formatContext(context, msg = undefined) {
    return `error on line ${context.ln + 1}${context.col !== undefined ? `, col ${context.col}` : ""}${msg !== undefined ? ": " + msg : ""}` + (context.parentcontext !== undefined ? `\nstacktrace:\n${formatContext(context.parentcontext)}` : "");
}

/**
@param {string} msg
@returns {{name: "JSLError", message: string}}
*/
function newJSLError(msg) {
    return {
        name: "JSLError",
        message: msg
    };
}

/**
@enum {string}
*/
const JSLTypes = {
    String: "String"
};

/**
@typedef {{value: any, type: string}} JSLType

@param {any} value 
@param {string} type 
@returns JSLType
*/
function newJSLType(value, type) {
    return { value: value, type: type };
}

class JSLStack {
    #stack;
    #context;
    /**
    @param {JSLContext} context 
    @param {string[] | undefined} initialValues 
    */
    constructor(context, initialValues = undefined) {
        this.#stack = initialValues !== undefined ? initialValues : []
        this.#context = context;
    }

    push(item) {
        this.#stack.push(item);
    }

    checkStack(throwErrorOnEmpty = true) {
        if (this.#stack.length === 0 && throwErrorOnEmpty) {
            throw newJSLError(formatContext(this.#context, "stack underflow"));
        }
    }

    pop(throwErrorOnEmpty = true) {
        this.checkStack(throwErrorOnEmpty);
        return this.#stack.pop();
    }

    peek(throwErrorOnEmpty = true) {
        this.checkStack(throwErrorOnEmpty);
        return this.#stack[this.#stack.length - 1];
    }

    isEmpty() {
        return this.#stack.length === 0;
    }
}

/**
@param {string | Array<string | JSLType>} text
@param {Map<string, function | JSLFunc | JSLContainer>} vars 
@returns {any | undefined}
*/
function evalJSLExpression(text, __context, vars) {
    let uncleaned_expr = typeof text === "string" ? text.split(" ") : text;

    const context = __context;

    let expr = [];
    {
        let new_expr = [];
        let acc = "";
        for (let i = 0; i < uncleaned_expr.length; i++) {
            if (acc !== "") {
                acc += " " + uncleaned_expr[i];
                if (uncleaned_expr[i].endsWith('"')) {
                    new_expr.push(newJSLType(acc.slice(1, acc.length - 1), JSLTypes.String));
                    acc = "";
                }
            } else if (uncleaned_expr[i].startsWith('"')) {
                if (uncleaned_expr[i].endsWith('"')) {
                    let s = uncleaned_expr[i].trim();
                    new_expr.push(newJSLType(s.slice(1, s.length - 1), JSLTypes.String));
                } else {
                    acc += uncleaned_expr[i];
                }
            } else {
                new_expr.push(uncleaned_expr[i].trim());
            }
        }
        if (acc !== "") {
            throw newJSLError(formatContext(context), "unterminated string literal");
        }
        expr = new_expr;
    }

    /**
    @type {Array<string | number | boolean | any[]>}
    */
    const stack = new JSLStack(context);
    let pushAsLiteral = false;

    for (let i = 0; i < expr.length; i++) {
        context.col += expr[i].length;
        let e = typeof expr[i] === "string" ? expr[i].trim() : expr[i];
        if (e === "") {
            continue;
        } else if (!isNaN(Number(e))) {
            stack.push(Number(e));
        } else if (e === "[]") {
            stack.push([]);
        } else if (e.type !== undefined) {
            switch (e.type) {
                case "String":
                    stack.push(e.value);
                    break;
                default:
                    throw new Error(`invalid JSLType type '${e.type}'`);
            }
        } else if (e === "lit") {
            pushAsLiteral = true;
        } else if (e === "true" || e === "false") {
            stack.push(e === "true" ? true : false);
        } else if (vars.get(e) !== undefined) {
            let vr = vars.get(e);
            if (pushAsLiteral) {
                if (vr.isJSLContainer === true) {
                    throw newJSLError(formatContext(context, "cannot push type onto expression stack"));
                }
                pushAsLiteral = false;
                stack.push(vr);
            } else if (typeof vr === "function") {
                let fnres = vr(context, stack);
                if (fnres !== undefined) {
                    stack.push(fnres);
                }
            } else if (vr.isJSLFunction === true) {
                let fnres = vr.run(stack, newJSLContext(0, 0, context), vars);
                if (fnres !== undefined)
                    stack.push(fnres);
            } else {
                stack.push(vr);
            }
        } else {
            throw newJSLError(formatContext(context, `unknown word '${e}'`));
        }
    }

    if (stack.length > 1) {
        throw newJSLError(formatContext(context, "evaluation stack has more than one value at the end of the expression"));
    }

    return stack.isEmpty() ? undefined : stack.pop();
}

/**
@param {JSLContext} ctx
@param {object} arr
*/
function isArrayOperatable(arr) {
    if (arr.push === undefined || arr.pop === undefined || arr.length === undefined)
        return false;
    return true;
}

/**
@type {Map<string, Function | JSLFunc>}
*/
let gvars = new Map();
[
    ["+", (_ctx, s) => {
        let a = s.pop();
        s.push(s.pop() + a);
    }],
    ["-", (_ctx, s) => {
        let a = s.pop();
        s.push(s.pop() - a);
    }],
    ["*", (_ctx, s) => {
        let a = s.pop();
        s.push(s.pop() * a);
    }],
    ["/", (_ctx, s) => {
        let a = s.pop();
        s.push(s.pop() / a);
    }],
    ["%", (_ctx, s) => {
        let a = s.pop();
        s.push(s.pop() % a);
    }],
    [">", (_ctx, s) => {
        let a = s.pop();
        s.push(s.pop() > a);
    }],
    ["<", (_ctx, s) => {
        let a = s.pop();
        s.push(s.pop() < a);
    }],
    ["==", (_ctx, s) => s.pop() === s.pop()],
    ["!=", (_ctx, s) => s.pop() !== s.pop()],
    ["&&", (_ctx, s) => s.pop() && s.pop()],
    ["||", (_ctx, s) => s.pop() || s.pop()],
    ["asString", (_ctx, s) => s.push(s.pop().toString())],
    ["asNumber", (ctx, s) => {
        let a = Number(s.pop());
        if (isNaN(a)) {
            throw newJSLError(formatContext(ctx, `cannot convert ${typeof a} into a number`));
        }
        s.push(a);
    }],
    ["type", (_ctx, s) => s.push(typeof s.pop())],
    ["dup", (_ctx, s) => {
        let a = s.pop();
        s.push(a);
        s.push(a);
    }],
    ["push", (ctx, s) => {
        let a = s.pop();
        if (!isArrayOperatable(a)) {
            throw newJSLError(formatContext(ctx, `'${a}'(typeof '${typeof a.type === "string" ? a.type : typeof a}') is not operable by list operations`));
        }
        a.push(s.pop());
        s.push(a);
    }],
    ["pop", (ctx, s) => {
        let a = s.pop();
        if (!isArrayOperatable(a)) {
            throw newJSLError(formatContext(ctx, `'${a}'(typeof '${typeof a.type === "string" ? a.type : typeof a}') is not operable by list operations`));
        } else if (a.length === 0) {
            throw newJSLError(formatContext(ctx, "cannot pop from empty list"));
        }
        s.push(a.pop());
        s.push(a);
    }],
    ["index", (ctx, s) => {
        let a = s.pop();
        if (!isArrayOperatable(a)) {
            throw newJSLError(formatContext(ctx, `'${a}'(typeof '${typeof a.type === "string" ? a.type : typeof a}') is not operable by list operations`));
        } else if (a.length === 0) {
            throw newJSLError(formatContext(ctx, "cannot index into empty list"));
        }
        let i = s.pop();
        if (typeof i !== "number" || (typeof i === "number" ? i >= a.length || a.length + i < 0 : false)) {
            throw newJSLError(formatContext(ctx, `'${a}'(typeof '${typeof a.type === "string" ? a.type : typeof a}') is not a valid list index`));
        }

        if (i < 0) {
            i = a.length + i;
        }

        s.push(a);
        s.push(a[i]);
    }],
    ["print", (_ctx, s) => console.log(s.pop(false))],
    ["printm", (_ctx, s) => {
        let a = s.pop();
        let b = [];
        for (let i = 0; i < a; i++)
            b.push(s.pop().toString());
        console.log(b.join(" "));
    }],
    ["fmt", (ctx, s) => {
        let origin = s.pop();
        let str = origin;
        if (typeof str !== "string") {
            throw newJSLError(formatContext(ctx, `expected 'string' to format but found '${typeof str}' instead`));
        }

        while (str.includes("{}")) {
            if (s.isempty()) {
                throw newJSLError(formatContext(ctx, `expected ${origin.count("{}")} items for formatting, but only found ${origin.count("{}") - (origin.count("{}") - str.count("{}"))} items on the stack`));
            }

            let pos = str.indexOf("{}");
            str = str.slice(0, pos) + String(s.pop()) + str.slice(pos + 2);
        }

        s.push(str);
    }],
    ["input", (_ctx, s) => {
        let input = jsruntime.getInput();
        if (input !== undefined) {
            s.push(input);
        }
    }],
    ["inputm", (_ctx, s) => {
        let input = jsruntime.getInput(s.pop());
        if (input !== undefined) {
            s.push(input);
        }
    }],
    ["throw", (ctx, s) => {
        throw newJSLError(formatContext(ctx, s.pop()));
    }],
    ["bye", (_ctx, _s) => {
        throw { name: "JSLExit", message: "This error is thrown to exit a JSL program, it should only be triggered by the 'bye' instruction" };
    }],

    // JSL-written built-in functions
    ["0=", new JSLFunc(["return $1 0 =="], 1)],
    ["head", new JSLFunc(["try", "-1 $1 index", "catch er", "if er \"cannot index into empty list\" ==", "\"\" throw", "else", "er throw", "end", "end"], 1)],
    ["tail", new JSLFunc(["try", "0 $1 index", "catch er", "if er \"cannot index into empty list\" ==", "\"\" throw", "else", "er throw", "end", "end"], 1)]
].forEach(elem => gvars.set(elem[0], elem[1]));

/**
@param {string} s
@returns {boolean}
*/
function isValidVariableName(s) {
    for (let i = 0; i < s.length; s++) {
        if (s[i].match("[a-z]|[A-Z]|[0-9]|_") === null)
            return false;
    }
    return true;
}

/**
@param {string | string[]} code
@param {Map<string, any | JSLFunc | function> | undefined} __vars
@param {JSLContext | undefined} context
@param {number} subcallMode
*/
function interpretJSL(code, __vars = undefined, context = undefined, subcallMode = 0) {
    let lines = typeof code === "string" ? code.split("\n") : code;
    lines.forEach((_, i) => lines[i] = lines[i].trim());

    if (context === undefined) {
        context = newJSLContext(0, 0);
    }

    let vars = new Map();
    if (__vars !== undefined) {
        __vars.forEach((v, k) => vars.set(k, v));
    }

    let funcToEndJumps = new Map();
    let tryToCatchJumps = new Map();
    let catchToEndJumps = new Map();
    let ifToEndJumps = new Map();
    let ifToElseJumps = new Map();
    let elseToEndJumps = new Map();
    let ifStack = [];
    lines.forEach((item, index) => {
        if (item.startsWith("if ")) {
            ifStack.push({ ifp: index, ep: undefined, type: 0 });
        } else if (item.startsWith("func ")) {
            ifStack.push({ ifp: index, ep: undefined, type: 1 });
        } else if (item === "try") {
            ifStack.push({ ifp: index, ep: undefined, type: 2 });
        } else if (item.startsWith(";[")) {
            ifStack.push({ ifp: index, ep: undefined, type: 4 });
        } else if (item === "else") {
            if (ifStack.length === 0 || (ifStack.length > 0 ? ifStack[ifStack.length - 1].type !== 0 : false)) {
                context.ln = index;
                throw newJSLError(formatContext(context, "unexpected 'else' outside of if statement"));
            }

            let _if = ifStack.pop();
            _if.ep = index;
            ifStack.push(_if);
        } else if (item.startsWith("catch ")) {
            if (ifStack.length === 0 || (ifStack.length > 0 ? ifStack[ifStack.length - 1].type !== 2 : false)) {
                context.ln = index;
                throw newJSLError(formatContext(context, "unexpected 'catch' outside of try-catch"));
            }

            let _if = ifStack.pop();
            _if.ep = index;
            ifStack.push(_if);
        } else if (item === "end") {
            if (ifStack.length === 0) {
                context.ln = index;
                throw newJSLError(formatContext(context, "unexpected 'end' outside of if statement, function block, container block, or try-catch"));
            }

            let _if = ifStack.pop();
            switch (_if.type) {
                case 0:
                    ifToEndJumps.set(_if.ifp, index);
                    if (_if.ep !== undefined) {
                        ifToElseJumps.set(_if.ifp, _if.ep);
                        elseToEndJumps.set(_if.ep, index);
                    }
                    break;
                case 1:
                    funcToEndJumps.set(_if.ifp, index);
                    break;
                case 2:
                    if (_if.ep === undefined) {
                        context.ln = _if.ifp;
                        throw newJSLError(formatContext(context, "try-catch blocks must always have a catch"));
                    }
                    tryToCatchJumps.set(_if.ifp, _if.ep);
                    catchToEndJumps.set(_if.ep, index);
                    break;
                default:
                    throw new Error(`unexpected _if type '${_if.type}'`);
            }
        } else if (item.startsWith(";]")) {
            let com = ifStack.pop();
            if (com !== undefined ? com.type !== 4 : true) {
                context.ln = index;
                throw newJSLError(formatContext(context, "unexpected ';]'"));
            }
            lines[index] = "";
            for (let i = com.ifp - 1; i < index; i++) {
                lines[i] = "";
            }
        }
    });

    if (ifStack.length !== 0) {
        let _if = ifStack.pop();
        context.ln = _if.ifp;
        throw newJSLError(formatContext(context, `expected '${_if.type === 4 ? ";]" : "end"}' to close ${["if statement", "function block", "try-catch", "container block", "multi-line comment"][_if.type]}`));
    }

    let skips = new Map();

    for (let ln = 0; ln < lines.length; ln++) {
        context.ln = ln;
        let l = lines[ln].trim();

        if (l === "" || l.startsWith(";")) {
            continue;
        } else if (skips.get(ln) !== undefined) {
            let skipln = skips.get(ln);
            skips.delete(ln);
            ln = typeof skipln === "object" ? skipln[0] : skipln;
            if (typeof skipln === "object") {
                skipln[1](vars);
            }
        } else if (l.startsWith("var ")) {
            let _l1 = l.slice(4).split(" ");
            for (let i = 0; i < _l1.length; i++)
                _l1[i] = _l1[i].trim();

            if (_l1[1] !== "=") {
                throw newJSLError(formatContext(context, "expected 'var [ident] = [expression]'"));
            } else if (!isValidVariableName(_l1[0])) {
                if (_l1[0] === "") {
                    throw newJSLError(formatContext(context, "identifiers cannot be empty"))
                }
                throw newJSLError(formatContext(context, `invalid identifier '${_l1[0]}'`))
            }

            let ident = _l1[0];
            let expr = _l1.slice(2).join(" ");
            if (vars.get(ident) !== undefined) {
                throw newJSLError(formatContext(context, `cannot create variable '${ident}' as it already exists`));
            }
            vars.set(ident, evalJSLExpression(expr, newJSLContext(ln, 0, context), vars));
        } else if (l.startsWith("set ")) {
            let _l1 = l.slice(4).split(" ");
            for (let i = 0; i < _l1.length; i++)
                _l1[i] = _l1[i].trim();

            if (_l1[1] !== "=") {
                throw newJSLError(formatContext(context, "expected 'set [ident] = [expression]'"));
            } else if (!isValidVariableName(_l1[0])) {
                if (_l1[0] === "") {
                    throw newJSLError(formatContext(context, "identifiers cannot be empty"));
                }
                throw newJSLError(formatContext(context, `invalid identifier '${_l1[0]}'`));
            }

            let ident = _l1[0];
            let expr = _l1.slice(2).join(" ");
            if (vars.get(ident) === undefined) {
                throw newJSLError(formatContext(context, `cannot set variable '${ident}' as it doesn't exist`));
            }
            vars.set(ident, evalJSLExpression(expr, newJSLContext(ln, 0, context), vars));
        } else if (l.startsWith("if ")) {
            let ifbool = l.slice(3).trim();
            if (ifbool === "") {
                throw newJSLError(formatContext(context, "if conditions cannot be empty"));
            }
            let condition = evalJSLExpression(ifbool, newJSLContext(ln, 0, context), vars);
            if (condition) {
                skips.set(ifToElseJumps.get(ln), ifToEndJumps.get(ln));
            } else if (ifToElseJumps.get(ln) !== undefined) {
                skips.set(ifToEndJumps.get(ln), ifToEndJumps.get(ln));
                ln = ifToElseJumps.get(ln);
            } else {
                ln = ifToEndJumps.get(ln);
            }
        } else if (l.startsWith("func ")) {
            let funcInfo = l.slice(5).trim();
            if (funcInfo === "") {
                throw newJSLError(formatContext(context, "function names cannot be empty"));
            }
            let sFuncInfo = funcInfo.split(" ");
            sFuncInfo.forEach((_, i) => sFuncInfo[i] = sFuncInfo[i].trim());
            if (sFuncInfo.length === 1) {
                sFuncInfo.push(0);
                if (sFuncInfo[0].includes("@") || sFuncInfo[0].includes("$")) {
                    throw newJSLError(formatContext(context, "'@' and '$' are reserved and cannot be used in user created variable names"));
                }
            } else if (sFuncInfo.length > 2) {
                throw newJSLError(formatContext(context, "expected 'func [name] [argument count]'"));
            } else if (isNaN(Number(sFuncInfo[1]))) {
                throw newJSLError(formatContext(context, `'${sFuncInfo[1]}' is not a valid amount of arguments(it must be an integer greater than or equal to 0)`));
            } else if (Number(sFuncInfo[1]) < 0) {
                throw newJSLError(formatContext(context, `'${sFuncInfo[1]}' is not a valid amount of arguments(it must be an integer greater than or equal to 0)`));
            }

            let sliced = lines.slice(ln + 1, funcToEndJumps.get(ln));
            vars.set(sFuncInfo[0], new JSLFunc(sliced, Number(sFuncInfo[1])));

            ln = funcToEndJumps.get(ln);
        } else if (l.startsWith("return")) {
            //console.log(subcallMode, vars.get("$1"));
            if (subcallMode !== 1) {
                throw newJSLError(formatContext(context, "cannot return outside of function"));
            }
            return evalJSLExpression(l.slice(6), newJSLContext(ln, 0, context), vars);
        } else if (l.startsWith("rem ")) {
            let ident = l.slice(4).trim().split(" ")[0].trim();
            if (ident === "") {
                throw newJSLError(formatContext(context, "expected 'rem [ident]'"));
            } else if (vars.get(ident) === undefined) {
                newJSLError(formatContext(context, `cannot delete variable '${ident}' as it doesn't exist`));
            }
            vars.delete(ident);
        } else if (l === "try") {
            let code = lines.slice(ln + 1, tryToCatchJumps.get(ln));
            try {
                interpretJSL(code, vars, newJSLContext(0, 0, context), 2);
                ln = catchToEndJumps.get(tryToCatchJumps.get(ln));
            } catch (error) {
                if (error.name !== "JSLError") {
                    throw error;
                }
                ln = tryToCatchJumps.get(ln);
                context.ln = ln;
                let c = lines[ln].trim();
                if (c !== "catch") {
                    let name = c.slice(5).trim();
                    if (!isValidVariableName(name)) {
                        throw newJSLError(formatContext(context, `'${name}' is not a valid variable name`));
                    }

                    let old_var = vars.get(name);
                    vars.set(name, error.message.split("\n")[0].split(":").slice(1).join(":").trim());

                    skips.set(catchToEndJumps.get(ln), [catchToEndJumps.get(ln), vrs => {
                        vrs.delete(name);
                        if (old_var !== undefined) vrs.set(name, old_var);
                    }]);
                } else {
                    skips.set(catchToEndJumps.get(ln), catchToEndJumps.get(ln));
                }
            }
        } else {
            evalJSLExpression(l, newJSLContext(ln, 0, context), vars);
        }
    }
}

try {
    let result = interpretJSL(`
;[
now I can talk
;]

func dupeStr 2
    if $2 0 ==
        return ""
    end

    var n = $2 1 -

    var s = $1 n dupeStr

    rem n

    return s $1 +
end

"he" 10 dupeStr print
`,
        gvars, newJSLContext(0));
    if (result !== undefined) {
        console.log(expr);
    }
} catch (error) {
    if (error.name !== "JSLError" && error.name !== "JSLExit") {
        throw error;
    } else if (error.name !== "JSLExit") {
        console.log(error.message);
    }
}

