const assert = require("assert");
const sinon = require("sinon");
const api = require("../..");

describe("Kafka", function() {
    describe("#trigger()", function() {
        it("should be able to trigger a new message in the adapter", async () => {
            const bus = new api.API({ hosts: "localhost:9092", adapter: "kafka" });

            const fakeProducer = {
                connect: () => {},
                send: () => {}
            };
            const connectSpy = sinon.spy(fakeProducer, "connect");
            const sendSpy = sinon.spy(fakeProducer, "send");
            const fakeClient = {
                producer: () => fakeProducer
            };
            const clientStub = sinon.stub(api.KafkaClient, "getInstance");
            clientStub.returns(fakeClient);

            await bus.trigger("test-topic", "test-event", { text: "Test Message" });

            assert.strictEqual(connectSpy.called, true);
            assert.strictEqual(sendSpy.called, true);

            clientStub.restore();
        });
    });

    describe("#bind()", function() {
        it("should be able to bind a callback to a topic in the adapter", async () => {
            const bus = new api.API({ hosts: "localhost:9092", adapter: "kafka" });

            const fakeConsumer = {
                connect: () => {},
                subscribe: () => {},
                run: () => {}
            };
            const connectSpy = sinon.spy(fakeConsumer, "connect");
            const subscribeSpy = sinon.spy(fakeConsumer, "subscribe");
            const runSpy = sinon.spy(fakeConsumer, "run");
            const fakeClient = {
                consumer: () => fakeConsumer
            };
            const clientStub = sinon.stub(api.KafkaClient, "getInstance");
            clientStub.returns(fakeClient);

            await bus.bind("test-topic", {
                callback: () => {}
            });

            assert.strictEqual(connectSpy.called, true);
            assert.strictEqual(subscribeSpy.calledWithExactly({ topic: "test-topic" }), true);
            assert.strictEqual(runSpy.called, true);

            clientStub.restore();
        });
    });
});
