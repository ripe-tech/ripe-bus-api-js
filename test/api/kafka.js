const fs = require("fs");
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
            const fakeKafkaClient = {
                producer: () => fakeProducer
            };
            const fakeClient = {
                client: fakeKafkaClient
            };
            const clientStub = sinon.stub(api.KafkaClient, "getInstance");
            clientStub.returns(fakeClient);

            await bus.trigger("test-topic.test-event", { text: "Test Message" });

            assert.strictEqual(connectSpy.called, true);
            assert.strictEqual(sendSpy.called, true);

            clientStub.restore();
        });
        it("should be able to trigger a message in the adapter for topics with global diffusion", async () => {
            const bus = new api.API({ hosts: "localhost:9092", adapter: "kafka" });

            const sentMessages = {};
            const fakeProducer = {
                connect: () => {},
                send: ({ topic, messages }) => {
                    sentMessages[topic] = [
                        ...(sentMessages[topic] || []),
                        ...messages.map(m => m.value)
                    ];
                }
            };
            const connectSpy = sinon.spy(fakeProducer, "connect");
            const sendSpy = sinon.spy(fakeProducer, "send");
            const fakeKafkaClient = {
                producer: () => fakeProducer
            };
            const fakeClient = {
                client: fakeKafkaClient
            };
            const clientStub = sinon.stub(api.KafkaClient, "getInstance");
            clientStub.returns(fakeClient);

            await bus.trigger("namespace1:namespace2:test-topic.test-event", {
                text: "Test Message"
            });

            assert.strictEqual(connectSpy.calledOnce, true);
            assert.strictEqual(sendSpy.callCount, 3);
            assert.strictEqual(Object.keys(sentMessages).includes("namespace1"), true);
            assert.strictEqual(Object.keys(sentMessages).includes("namespace1-namespace2"), true);
            assert.strictEqual(
                Object.keys(sentMessages).includes("namespace1-namespace2-test-topic"),
                true
            );

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
            const fakeKafkaClient = {
                consumer: () => fakeConsumer
            };
            const fakeClient = {
                client: fakeKafkaClient
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

        it("should be able to call the callback of a topic bind when receiving messages", async () => {
            const bus = new api.API({ hosts: "localhost:9092", adapter: "kafka" });
            const messages = [
                { value: JSON.stringify({ text: "Test Message 1" }) },
                { value: JSON.stringify({ text: "Test Message 2" }) }
            ];

            const fakeConsumer = {
                connect: () => {},
                subscribe: () => {},
                disconnect: () => {},
                run: ({ eachBatch }) => {
                    eachBatch({
                        batch: { topic: "test-topic", messages: messages },
                        heartbeat: () => {},
                        isRunning: () => true,
                        isStale: () => false
                    });
                }
            };
            const connectSpy = sinon.spy(fakeConsumer, "connect");
            const subscribeSpy = sinon.spy(fakeConsumer, "subscribe");
            const runSpy = sinon.spy(fakeConsumer, "run");
            const fakeKafkaClient = {
                consumer: () => fakeConsumer
            };
            const fakeClient = {
                client: fakeKafkaClient
            };
            const clientStub = sinon.stub(api.KafkaClient, "getInstance");
            clientStub.returns(fakeClient);

            const callback = sinon.spy();

            await bus.bind("test-topic", {
                callback: callback
            });

            assert.strictEqual(connectSpy.called, true);
            assert.strictEqual(subscribeSpy.calledWithExactly({ topic: "test-topic" }), true);
            assert.strictEqual(runSpy.called, true);
            assert.strictEqual(callback.calledTwice, true);
            assert.strictEqual(
                callback.firstCall.calledWith({ text: "Test Message 1" }, "test-topic"),
                true
            );
            assert.strictEqual(
                callback.secondCall.calledWith({ text: "Test Message 2" }, "test-topic"),
                true
            );

            await bus.destroy();
            clientStub.restore();
        });

        it("should be able to bind a callback to a topic in the adapter with retry logic", async () => {
            const bus = new api.API({ hosts: "localhost:9092", adapter: "kafkaRetry" });

            const fakeConsumer = {
                connect: () => {},
                subscribe: () => {},
                disconnect: () => {},
                run: () => {}
            };
            const connectSpy = sinon.spy(fakeConsumer, "connect");
            const subscribeSpy = sinon.spy(fakeConsumer, "subscribe");
            const runSpy = sinon.spy(fakeConsumer, "run");
            const fakeKafkaClient = {
                consumer: () => fakeConsumer
            };
            const fakeClient = {
                client: fakeKafkaClient
            };
            const clientStub = sinon.stub(api.KafkaClient, "getInstance");
            clientStub.returns(fakeClient);

            await bus.bind("test-topic", {
                callback: () => {}
            });

            assert.strictEqual(connectSpy.called, true);
            assert.strictEqual(subscribeSpy.calledWithExactly({ topic: "test-topic" }), true);
            assert.strictEqual(runSpy.called, true);

            await bus.destroy();
            clientStub.restore();
        });

        it("should be able to retry to process a message if the bind callback fails", async () => {
            const bus = new api.API({ hosts: "localhost:9092", adapter: "kafkaRetry" });
            const messages = [{ value: JSON.stringify({ text: "Test Message 1" }) }];

            const fakeConsumer = {
                connect: () => {},
                subscribe: () => {},
                disconnect: () => {},
                run: ({ eachBatch }) => {
                    eachBatch({
                        batch: { topic: "test-topic", messages: messages },
                        heartbeat: () => {},
                        isRunning: () => true,
                        isStale: () => false
                    });
                }
            };
            const connectSpy = sinon.spy(fakeConsumer, "connect");
            const subscribeSpy = sinon.spy(fakeConsumer, "subscribe");
            const runSpy = sinon.spy(fakeConsumer, "run");
            const fakeKafkaClient = {
                consumer: () => fakeConsumer
            };
            const fakeClient = {
                client: fakeKafkaClient
            };
            const clientStub = sinon.stub(api.KafkaClient, "getInstance");
            clientStub.returns(fakeClient);

            const bindOptions = {
                callback: () => {
                    throw Error();
                },
                retries: 1,
                retryInterval: 0,
                retryDelay: 0,
                messageDelayExponential: 0
            };
            const callbackSpy = sinon.spy(bindOptions, "callback");

            await bus.bind("test-topic", bindOptions);
            await new Promise(resolve => setTimeout(resolve, 0));

            assert.strictEqual(connectSpy.called, true);
            assert.strictEqual(subscribeSpy.calledWithExactly({ topic: "test-topic" }), true);
            assert.strictEqual(runSpy.called, true);
            assert.strictEqual(callbackSpy.callCount, 2);
            assert.strictEqual(
                callbackSpy.calledWith({ text: "Test Message 1" }, "test-topic"),
                true
            );

            await Promise.all([bus.destroy(), fs.promises.unlink("data/retry.json")]);
            clientStub.restore();
        });
    });
});
