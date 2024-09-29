class JSLFunc {
    /**
    @param {string[]} code
    @param {number} args
    */
    constructor(code, args) {
        this.code = code;
        this.args = args;
        this.fieldToCheckIfThisObjectIsAJSLFunction = true;
    }

    run(stack, context, vars) {
        for (let i = 0; i < this.args; i++)
            vars.set(`$${i + 1}`, stack.pop());
        let newVars = new Map();
        vars.forEach((v, k) => newVars.set(k, v));
        return interpretJSL(this.code, newVars, context, 1);
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

class JSLStack {
    /**
    @param {JSLContext} context 
    @param {string[] | undefined} initialValues 
    */
    constructor(context, initialValues = undefined) {
        this.stack = initialValues !== undefined ? initialValues : []
        this.context = context
    }

    push(item) {
        this.stack.push(item);
    }

    pop(throwErrorOnEmpty = true) {
        if (this.stack.length === 0) {
            if (throwErrorOnEmpty)
                throw newJSLError(formatContext(this.context, "stack underflow"));
            return undefined;
        }
        return this.stack.pop();
    }

    empty() {
        return this.stack.length === 0;
    }
}

/**
@param {string | string[]} text
@param {Map<string, function | JSLFunc>} vars 
@returns {any | undefined}
*/
function evalJSLExpression(text, __context, vars) {
    let expr = typeof text === "string" ? text.split(" ") : text;

    const context = __context;

    {
        let new_expr = [];
        let acc = "";
        for (let i = 0; i < expr.length; i++) {
            if (acc !== "") {
                acc += " " + expr[i];
                if (expr[i].endsWith('"')) {
                    new_expr.push(acc);
                    acc = "";
                }
            } else if (expr[i].startsWith('"')) {
                if (expr[i].endsWith('"')) {
                    new_expr.push(expr[i].trim());
                } else {
                    acc += expr[i];
                }
            } else {
                new_expr.push(expr[i].trim());
            }
        }
        expr = new_expr;
    }

    const stack = new JSLStack(context);
    let pushAsLiteral = false;

    for (let i = 0; i < expr.length; i++) {
        context.col += expr[i].length;
        let e = expr[i].trim();
        if (e === "") {
            continue;
        } else if (!isNaN(Number(e))) {
            stack.push(Number(e));
        } else if (e.startsWith('"') && e.endsWith('"') && e.length > 1) {
            stack.push(e.slice(1, e.length - 1));
        } else if (e === "lit") {
            pushAsLiteral = true;
        } else if (e === "true" || e === "false") {
            stack.push(e === "true" ? true : false);
        } else if (vars.get(e) !== undefined) {
            let vr = vars.get(e);
            if (pushAsLiteral) {
                pushAsLiteral = false;
                stack.push(vr);
            } else if (typeof vr === "function") {
                let fnres = vr(context, stack);
                if (fnres !== undefined) {
                    stack.push(fnres);
                }
            } else if (vr.fieldToCheckIfThisObjectIsAJSLFunction === true) {
                let fnres = vr.run(stack, newJSLContext(0, context.col, context), vars);
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

    return stack.empty() ? undefined : stack.pop();
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
    ["print", (_ctx, s) => console.log(s.pop(false))],
    ["printm", (_ctx, s) => {
        let a = s.pop();
        let b = [];
        for (let i = 0; i < a; i++)
            b.push(s.pop().toString());
        console.log(b.join(" "));
    }],
    ["bye", (_ctx, _s) => {
        throw { name: "JSLExit", message: "This error is thrown to exit a JSL program, it should only be triggered by the 'bye' instruction" };
    }]
].forEach(elem => gvars.set(elem[0], elem[1]));

/**
@param {string} s
@returns {boolean}
*/
function isValidIdent(s) {
    for (let i = 0; i < s.length; s++) {
        if (s[i].match("[a-z]|[A-Z]|[0-9]|_") === null)
            return false;
    }
    return true;
}

/**
@param {string | string[]} code
@param {Map<string, any | JSLFunc | function> | undefined} vars
@param {JSLContext | undefined} context
@param {number} subcallMode
*/
function interpretJSL(code, vars = undefined, context = undefined, subcallMode = 0) {
    let lines = typeof code === "string" ? code.split("\n") : code;
    lines.forEach((_, i) => lines[i] = lines[i].trim());

    if (context === undefined) {
        context = newJSLContext(0, 0);
    }

    let funcToEndJumps = new Map();
    let ifToEndJumps = new Map();
    let ifToElseJumps = new Map();
    let elseToEndJumps = new Map();
    let ifStack = [];
    lines.forEach((item, index) => {
        if (item.startsWith("if ")) {
            ifStack.push({ ifp: index, ep: undefined, isFunc: false });
        } else if (item.startsWith("func ")) {
            ifStack.push({ ifp: index, ep: undefined, isFunc: true });
        } else if (item === "else") {
            if (ifStack.length === 0 || ifStack.length > 0 ? ifStack[ifStack.length - 1].isFunc : false) {
                context.ln = index;
                throw newJSLError(formatContext(context, "unexpected 'else' outside of if statement"));
            }

            let _if = ifStack.pop();
            if (!_if.isFunc) {
                _if.ep = index;
            }
            ifStack.push(_if);
        } else if (item === "end") {
            if (ifStack.length === 0) {
                context.ln = index;
                throw newJSLError(formatContext(context, "unexpected 'end' outside of if statement"));
            }

            let _if = ifStack.pop();
            if (_if.isFunc) {
                funcToEndJumps.set(_if.ifp, index);
            } else {
                ifToEndJumps.set(_if.ifp, index);
                if (_if.ep !== undefined) {
                    ifToElseJumps.set(_if.ifp, _if.ep);
                    elseToEndJumps.set(_if.ep, index);
                }
            }
        }
    });

    if (ifStack.length !== 0) {
        let _if = ifStack.pop();
        context.ln = _if.ifp;
        throw newJSLError(formatContext(context, `expected 'end' to close ${_if.isFunc ? "function" : "if statement"}`));
    }

    let skips = new Map();

    for (let ln = 0; ln < lines.length; ln++) {
        context.ln = ln;
        let l = lines[ln].trim();

        if (l === "" || l.startsWith(";")) {
            continue;
        } else if (skips.get(ln) !== undefined) {
            ln = skips.get(ln);
            skips.delete(ln);
        } else if (l.startsWith("var ")) {
            let _l1 = l.slice(4).split(" ");
            for (let i = 0; i < _l1.length; i++)
                _l1[i] = _l1[i].trim();

            if (_l1[1] !== "=") {
                throw newJSLError(formatContext(context, "expected 'var [ident] = [expression]'"));
            } else if (!isValidIdent(_l1[0])) {
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
            } else if (!isValidIdent(_l1[0])) {
                if (_l1[0] === "") {
                    throw newJSLError(formatContext(context, "identifiers cannot be empty"))
                }
                throw newJSLError(formatContext(context, `invalid identifier '${_l1[0]}'`))
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
                sFuncInfo = [funcInfo, 0];
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
            console.log(subcallMode, vars.get("$1"));
            if (subcallMode !== 1) {
                throw newJSLError(formatContext(context, "cannot return outside of function"));
            }
            return evalJSLExpression(l.slice(6), newJSLContext(ln, 0, context), vars);
        } else {
            evalJSLExpression(l, newJSLContext(ln, 0, context), vars);
        }
    }
}

try {
    let result = interpretJSL(`var inp = -3
var x = inp 0 == inp 0 < ||
x print`,
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
