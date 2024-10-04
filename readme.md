# JSL

JSL is a procedural dynamically-typed interpreted language with FORTH-like stack-based expressions

## Features

[x] Basic arithmetic
[x] If/else statements(no elseif)
[x] Functions
[*] throwing and try-catch
[ ] elsif for elseif because I enjoy Ruby
[ ] struct-like data structures called Containers

## Examples

**Hello world**
```
"hello world!" print
```

**Basic calculator**
```
var first = "what is the first number?" inputm

var second = "what is the second number?" inputm

var op = "what is the operation?" inputm

var n1 = 0
try
    set n1 = first asNumber
catch
    first "'{}' is not a number" fprint
    bye
end

var n2 = 0
try
    set n2 = second asNumber
catch
    second "'{}' is not a number" fprint
    bye
end

var result = 0

if op "+" ==
    set result = n1 n2 +
elsif op "-" ==
    set result = n1 n2 -
elsif op "*" ==
    set result = n1 n2 *
elsif op "/" ==
    set result = n1 n2 /
else
    op "'{}' is not a valid operator" fprint
    bye
end

result "the result is: {}" fprint
```
