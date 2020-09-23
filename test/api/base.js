const assert = require("assert");
const api = require("../..");

describe("API", function() {
    describe("#constructor()", function() {
        it("should be able to instantiate a new API", () => {
            const bus = new api.API({ hosts: "localhost:9092" });

            assert.deepStrictEqual(bus.options, { hosts: "localhost:9092" });
        });
    });
});
