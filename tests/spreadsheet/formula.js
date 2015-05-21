(function(){

    module("Formula parser/printer/evaluator");

    var calc = kendo.spreadsheet.calc;
    var runtime = calc.Runtime;

    // check for the existence of `props` in `obj` (deep).  does not
    // mind if `obj` contains additional properties, but those
    // specified in 'props' must be present and have same values.
    function hasProps(obj, props) {
        for (var i in props) {
            if (Object.prototype.hasOwnProperty.call(props, i)) {
                var val = props[i];
                if (Array.isArray(val) || (typeof val == "object" && val != null)) {
                    hasProps(obj[i], val);
                } else {
                    equal(obj[i], val);
                }
            }
        }
    }

    // minimal data object with the glue functionality so we
    // can run expressions.
    var Spreadsheet = kendo.Class.extend({
        init: function() {
            this.data = {};
            this.maxrow = 0;
            this.maxcol = 0;
        },
        onFormula: function(sheet, row, col, value) {
            this.maxrow = Math.max(row, this.maxrow);
            this.maxcol = Math.max(col, this.maxcol);
            var cell = this.data[this.id(row, col)];
            if (!cell) {
                this.data[this.id(row, col)] = cell = {};
            }
            cell.value = value;
        },
        getRefCells: function(ref) {
            if (ref instanceof runtime.CellRef) {
                var cell = this.get(ref.row, ref.col);
                return cell ? [ cell ] : [];
            }
            if (ref instanceof runtime.RangeRef) {
                ref = ref.intersect(this.bounds());
                if (!(ref instanceof runtime.RangeRef)) {
                    return this.getRefCells(ref);
                }
                var a = [];
                for (var row = ref.topLeft.row; row <= ref.bottomRight.row; ++row) {
                    for (var col = ref.topLeft.col; col <= ref.bottomRight.col; ++col) {
                        var cell = this.get(row, col);
                        if (cell) {
                            cell.sheet = "sheet1";
                            cell.row = row;
                            cell.col = col;
                            a.push(cell);
                        }
                    }
                }
                return a;
            }
            if (ref instanceof runtime.UnionRef) {
                var a = [];
                for (var i = 0; i < ref.refs.length; ++i) {
                    a = a.concat(this.getRefCells(ref.refs[i]));
                }
                return a;
            }
            return [];
        },
        getData: function(ref) {
            if (!(ref instanceof runtime.Ref)) {
                return ref;
            }
            var a = this.getRefCells(ref).filter(function(cell){
                return cell.value != null;
            }).map(function(cell){
                return cell.value;
            });
            return ref instanceof runtime.CellRef ? a[0] : a;
        },
        makeRef: function(ref) {
            if (ref instanceof runtime.Ref) {
                return ref;
            }
            var x = calc.parse("sheet1", 0, 0, "=" + ref);
            hasProps(x, { type: "exp", ast: { type: "ref" }});
            return x.ast;
        },
        set: function(row, col, val) {
            val = calc.parse("sheet1", row, col, val);
            if (val.type == "exp") {
                val = { formula: calc.compile(val), exp: val };
            }
            this.maxrow = Math.max(row, this.maxrow);
            this.maxcol = Math.max(col, this.maxcol);
            this.data[this.id(row, col)] = val;
        },
        bounds: function() {
            return runtime.makeRangeRef(
                runtime.makeCellRef(1, 1, 3),
                runtime.makeCellRef(this.maxrow, this.maxcol, 3)
            ).setSheet("sheet1");
        },
        get: function(row, col) {
            return this.data[this.id(row, col)];
        },
        id: function(row, col) {
            return row + ":" + col;
        },
        fill: function(data) {
            var self = this;
            Object.keys(data).forEach(function(key){
                var ref = self.makeRef(key);
                self.set(ref.row, ref.col, data[key]);
            });
        },
        recalculate: function(callback) {
            var self = this;
            var cells = self.getRefCells(self.bounds()).filter(function(cell){
                if (cell.formula) {
                    cell.formula.reset();
                    return true;
                }
            });
            var count = cells.length;
            if (callback && !count) {
                callback();
            }
            cells.forEach(function(cell){
                cell.formula.exec(self, "sheet1", cell.row, cell.col, function(){
                    if (callback && !--count) {
                        callback();
                    }
                });
            });
        }
    });

    // test async function
    runtime.defineFunction("asum", function(callback, args) {
        var self = this, timeout = args.shift();
        setTimeout(function(){
            var sum = 0;
            var values = runtime.cellValues(self, args);
            runtime.forNumbers(self, values, function(num){
                sum += num;
            });
            callback(sum);
        }, timeout);
    });

    /* -----[ parser tests ]----- */

    test("cell reference", function(){
        var exp = calc.parse("sheet1", 1, 1, "=G5");
        hasProps(exp, {
            type: "exp",
            ast: {
                type: "ref",
                ref: "cell",
                sheet: "sheet1",
                row: 5,
                col: 7,
                rel: 3
            }
        })
    });

    test("normalizes range reference", function(){
        var exp = calc.parse("sheet1", 1, 1, "=A4:C2");
        hasProps(exp, {
            type: "exp",
            ast: {
                type: "ref",
                ref: "range",
                sheet: "sheet1",
                topLeft: {      // A2
                    type: "ref",
                    ref: "cell",
                    row: 2,
                    col: 1,
                    rel: 3
                },
                bottomRight: {  // C4
                    type: "ref",
                    ref: "cell",
                    row: 4,
                    col: 3,
                    rel: 3
                }
            }
        });
    });

    test("function call", function(){
        var exp = calc.parse("sheet1", 1, 1, "=sum(A2, A3, A4)");
        hasProps(exp, {
            type: "exp",
            ast: {
                type: "call",
                func: "sum",
                args: [
                    { type: "ref", ref: "cell", row: 2, col: 1 },
                    { type: "ref", ref: "cell", row: 3, col: 1 },
                    { type: "ref", ref: "cell", row: 4, col: 1 },
                ]
            }
        });
    });

    test("union operator", function(){
        var exp = calc.parse("sheet1", 1, 1, "=sum((A2, A3, A4))");
        hasProps(exp, {
            type: "exp",
            ast: {
                type: "call",
                func: "sum",
                args: [
                    { type: "binary", op: ",",
                      left: { type: "binary", op: ",",
                              left: { type: "ref", ref: "cell", row: 2, col: 1 },
                              right: { type: "ref", ref: "cell", row: 3, col: 1 }
                            },
                      right: { type: "ref", ref: "cell", row: 4, col: 1 }
                    }
                ]
            }
        });
    });

    test("intersection operator", function(){
        var exp = calc.parse("sheet1", 1, 1, "=sum(A2:A5 A3:A4, Sheet2!FOO)");
        hasProps(exp, {
            type: "exp",
            ast: {
                type: "call",
                func: "sum",
                args: [
                    // first arg is intersection of A2:A5 x A3:A4
                    { type: "binary", op: " ",
                      left: { type: "ref", ref: "range", // A2:A5
                              topLeft: { type: "ref", ref: "cell", row: 2, col: 1 },
                              bottomRight: { type: "ref", ref: "cell", row: 5, col: 1 },
                            },
                      right: { type: "ref", ref: "range", // A3:A4
                               topLeft: { type: "ref", ref: "cell", row: 3, col: 1 },
                               bottomRight: { type: "ref", ref: "cell", row: 4, col: 1 },
                             },
                    },
                    // second arg is the user-defined name FOO
                    { type: "ref", ref: "name", name: "FOO", sheet: "Sheet2", _hasSheet: true }
                ]
            }
        });
    });

    test("operator precedence", function(){
        var exp = calc.parse("sheet1", 1, 1, "=a + b * c + d / e");
        hasProps(exp, {
            type: "exp",
            ast: {
                type: "binary", op: "+",
                left: { type: "binary", op: "+", // a+b*c
                        left: { name: "a" },
                        right: { type: "binary", op: "*", // b*c
                                 left: { name: "b" },
                                 right: { name: "c" }
                               }
                      },
                right: { type: "binary", op: "/", // d/e
                         left: { name: "d" },
                         right: { name: "e" }
                       }
            }
        });
    });

    /* -----[ printer tests ]----- */

    test("print adjusts cell references", function(){
        var exp = calc.parse("sheet1", 1, 2, "=sum(A1:A5)");
        var formula = calc.compile(exp);
        var origCell = { formula: formula, row: 1, col: 2, sheet: "sheet1" };

        var str = calc.print("sheet1", 2, 2, exp, origCell);
        equal(str, "sum(A2:A6)");

        var str = calc.print("sheet1", 3, 3, exp, origCell);
        equal(str, "sum(B3:B7)");
    });

    test("print absolute references", function(){
        function testOne(input, output) {
            var exp = calc.parse("sheet1", 1, 2, input);
            var formula = calc.compile(exp);
            var origCell = { formula: formula, row: 1, col: 2, sheet: "sheet1" };

            var str = calc.print("sheet1", 5, 5, exp, origCell);
            equal(str, output);
        }
        testOne("=A1", "D5");
        testOne("=$A1", "$A5");
        testOne("=A$1", "D$1");
        testOne("=$A$1", "$A$1");

        testOne("=sum(A1:C3)", "sum(D5:F7)");
        testOne("=sum($A1:C3)", "sum($A5:F7)");
        testOne("=sum(A$1:C3)", "sum(D$1:F7)");
        testOne("=sum($A$1:C3)", "sum($A$1:F7)");
        testOne("=sum(A1:$C3)", "sum(D5:$C7)");
        testOne("=sum(A1:C$3)", "sum(D5:F$3)");
        testOne("=sum(A1:$C$3)", "sum(D5:$C$3)");
    });

    /* -----[ reference operations ]----- */

    test("reference intersection", function(){
        function ref(input) {
            var exp = calc.parse("sheet1", 1, 1, "=" + input);
            hasProps(exp, {
                type: "exp",
                ast: {
                    type: "ref"
                }
            });
            ok(exp.ast instanceof runtime.Ref);
            return exp.ast;
        }
        function print(ref) {
            return ref.print(1, 1, { row: 1, col: 1 });
        }
        function intersect(r1, r2) {
            return print(ref(r1).intersect(ref(r2)))
        }
        equal(intersect("B3:D6", "A1:E7"), "B3:D6");
        equal(intersect("B3:D6", "B6:D10"), "B6:D6");
        equal(intersect("A1:A3", "A3:A6"), "A3");
        equal(intersect("A1:A3", "A4:A5"), "#NULL!");

        equal(intersect("B3:D6", "A1:B3"), "B3");
        equal(intersect("B3:D6", "A1:C4"), "B3:C4");

        equal(intersect("B3:D6", "D1:D10"), "D3:D6");
        equal(intersect("B3:D6", "E1:E10"), "#NULL!");
        equal(intersect("B3:D6", "D1:D3"), "D3");

        equal(intersect("B3:D6", "D5:E10"), "D5:D6");
        equal(intersect("B3:D6", "D6:E10"), "D6");
        equal(intersect("B3:D6", "D7:E10"), "#NULL!");

        equal(intersect("B3:D6", "A5:D6"), "B5:D6");
        equal(intersect("B3:D6", "A6:D6"), "B6:D6");
        equal(intersect("B3:D6", "A7:D8"), "#NULL!");
        equal(intersect("B3:D6", "A6:B6"), "B6");

        equal(intersect("B3:D6", "1:2"), "#NULL!");
        equal(intersect("B3:D6", "2:3"), "B3:D3");
        equal(intersect("B3:D6", "3:4"), "B3:D4");
        equal(intersect("B3:D6", "A:E"), "B3:D6");
        equal(intersect("B3:D6", "A:C"), "B3:C6");
        equal(intersect("B3:D6", "C:C"), "C3:C6");
        equal(intersect("B3:D6", "C:E"), "C3:D6");
        equal(intersect("B3:D6", "E:F"), "#NULL!");
    });

    /* -----[ expression evaluation ]----- */

    test("evaluate simple sum", function(){
        var ss = new Spreadsheet();
        ss.fill({
            A1: 1, B1: 2, C1: 3,
            A2: 4, B2: 5, C2: 6,
            A3: 7, B3: 8, C3: 9,
            D1: "=sum(A1:C3)"
        });
        ss.recalculate(function(){
            equal(ss.getData(ss.makeRef("D1")), 45);
        });
    });

    test("evaluate average", function(){
        var ss = new Spreadsheet();
        ss.fill({
            A1: 1, B1: 2, C1: 3,
            A2: 4, B2: 5, C2: 6,
            A3: 7, B3: 8, C3: 9,
            D1: "=average(A1:C3)"
        });
        ss.recalculate(function(){
            equal(ss.getData(ss.makeRef("D1")), 5);
        });
    });

    test("average ignores non-numeric cells", function(){
        var ss = new Spreadsheet();
        ss.fill({
            A1: 2, B1: "foo", C1: 3,
            A2: "bar",
            D1: "=average(A1:C3)"
        });
        ss.recalculate(function(){
            equal(ss.getData(ss.makeRef("D1")), 2.5);
        });
    });

    test("evaluate dependent formulas", function(){
        var ss = new Spreadsheet();
        ss.fill({
            A1: 1, B1: 2, C1: 3,
            A2: 4, B2: 5, C2: 6,
            A3: 7, B3: 8, C3: 9,
            D1: "=sum(A1:C3, D2)",
            D2: "=sum(A1:C3)"
        });
        ss.recalculate(function(){
            equal(ss.getData(ss.makeRef("D1")), 90);
            equal(ss.getData(ss.makeRef("D2")), 45);
        });
    });

    asyncTest("async formulas", function(){
        var ss = new Spreadsheet();
        ss.fill({
            A1: 1, B1: 2, C1: 3,
            A2: 4, B2: 5, C2: 6,
            A3: 7, B3: 8, C3: 9,
            D1: "=sum(A1:C3, D2)",
            D2: "=asum(100, A1:A3)",
            D3: "=asum(100, A1:A3, asum(200, B1:B3))",
            E1: "=sum(A:D)",
            E2: "=asum(50, A:D)",
            E3: "=asum(50, A:D, asum(100, A:D))"
        });
        var time = Date.now();
        ss.recalculate(function(){
            console.log("recalculate async took " + (Date.now() - time) + " milliseconds");
            start();
            equal(ss.getData(ss.makeRef("D1")), 57);
            equal(ss.getData(ss.makeRef("D2")), 12);
            equal(ss.getData(ss.makeRef("D3")), 27);
            equal(ss.getData(ss.makeRef("E1")), 141);
            equal(ss.getData(ss.makeRef("E2")), 141);
            equal(ss.getData(ss.makeRef("E3")), 282);
        });
    });

})();
