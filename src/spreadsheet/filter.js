(function(f, define){
    define([ "../kendo.core", "../kendo.data" ], f);
})(function(){
(function(kendo) {
    /*jshint evil: true */
    var Filter = kendo.spreadsheet.Filter = kendo.Class.extend({
        prepare: function(range) {
        },
        value: function(cell) {
            return cell.value;
        },
        matches: function() {
            throw new Error("The 'matches' method is not implemented.");
        },
        toJSON: function() {
            throw new Error("The 'toJSON' method is not implemented.");
        }
    });

    Filter.create = function(options) {
        var type = options.type;

        if (!type) {
            throw new Error("Filter type not specified.");
        }

        var constructor = kendo.spreadsheet[type.charAt(0).toUpperCase() + type.substring(1) + "Filter"];

        if (!constructor) {
            if (/(top|bottom)(Number|Percent)/.test(type)) {
                constructor = kendo.spreadsheet.TopFilter;
            } else {
                throw new Error("Filter type not recognized.");
            }
        }

        return new constructor(options);
    };

    kendo.spreadsheet.ValueFilter = Filter.extend({
        _values: [],

        _dates: [],

        _blanks: false,

        init: function(options) {
            if (options.values !== undefined) {
                this._values = options.values;
            }

            if (options.blanks !== undefined) {
                this._blanks = options.blanks;
            }

            if (options.dates !== undefined) {
                this._dates = options.dates;
            }
        },

        value: function(cell) {
            var value = cell.value;

            if (this._dates.length > 0 && cell.format && typeof value === "number") {
                var type = kendo.spreadsheet.formatting.type(value, cell.format);

                if (type === "date") {
                    value = kendo.spreadsheet.numberToDate(value);
                }
            }

            return value;
        },

        matches: function(value) {
            if (value === null) {
                return this._blanks;
            }

            if (value instanceof Date) {
                return this._dates.some(function(date) {
                    return date.year === value.getFullYear() &&
                        (date.month === undefined || date.month === value.getMonth()) &&
                        (date.day === undefined || date.day === value.getDate()) &&
                        (date.hours === undefined || date.hours === value.getHours()) &&
                        (date.minutes === undefined || date.minutes === value.getMinutes()) &&
                        (date.seconds === undefined || date.seconds === value.getSeconds());
                });
            }

            return this._values.indexOf(value) >= 0;
        },
        toJSON: function() {
            return {
                type: "value",
                values: this._values.slice(0)
            };
        }
    });

    kendo.spreadsheet.CustomFilter = Filter.extend({
        _logic: "and",
        init: function(options) {
            if (options.logic !== undefined) {
                this._logic = options.logic;
            }

            if (options.criteria === undefined) {
                throw new Error("Must specify criteria.");
            }

            this._criteria = options.criteria;

            var expression = kendo.data.Query.filterExpr({
                logic: this._logic,
                filters: this._criteria
            }).expression;

            this._matches = new Function("d", "return " + expression);
        },
        matches: function(value) {
            if (value === null) {
                return false;
            }

            return this._matches(value);
        },
        toJSON: function() {
            return {
                type: "custom",
                logic: this._logic,
                criteria: this._criteria
            };
        }
    });

    kendo.spreadsheet.TopFilter = Filter.extend({
        init: function(options) {
            this._type = options.type;
            this._value = options.value;
            this._values = [];
        },

        prepare: function(range) {
            var values = range.values().map(function(row) {
                return row[0];
            })
            .sort()
            .filter(function(value, index, array) {
                return index === 0 || value !== array[index - 1];
            });

            if (this._type === "topNumber" || this._type == "topPercent") {
                values.sort(function(x, y) {
                    return y - x;
                });
            } else {
                values.sort(function(x, y) {
                    return x - y;
                });
            }

            var count = this._value;

            if (this._type === "topPercent" || this._type === "bottomPercent") {
                count = (values.length * count / 100) >> 0;
            }

            this._values = values.slice(0, count);
        },
        matches: function(value) {
            return this._values.indexOf(value) >= 0;
        },
        toJSON: function() {
            return {
                type: this._type,
                value: this._value
            };
        }
    });

})(kendo);
}, typeof define == 'function' && define.amd ? define : function(_, f){ f(); });
