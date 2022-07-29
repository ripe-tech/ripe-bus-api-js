# RIPE Bus API (for Javascript)

The Javascript API for the RIPE event bus.

Should be able to provide an easy-to-use API to be used by microservices of the PERI family.

## Initialization

```javascript
import { API as RipeBusAPI } from "ripe-bus-api-js";

await RipeBusAPI.load();
const bus = new RipeBusAPI();
```

## Usage

### Producer

The producer can send one or more events:

```javascript
bus.trigger("order.created", { id: 1, ... });

bus.trigger("order.created_multiple", [{ id: 1, ... }, { id: 2, ... }]);
```

The topic defaults to the first part of the name (separated with '.'). The example below defaults to the `order` topic and the event name is `order.created`:

```javascript
bus.trigger("order.created", { id: 1, ... });
```

The third parameter allows to pass other options to configure event trigger operation. Additional event metadata is added by the API but you can explicitly set it as follows (using options):

```javascript
bus.trigger("order.created", { id: 1, ... }, {
    topic: "ripe_core.order",
    origin: "ripe-core",
    hostname: "ripe-core.now.platforme.com",
    timestamp: 16007020
});
```

#### Producer options

| Name                         | Type   | Default                 | Adapter | Description                                                                                                                                           |
| ---------------------------- | ------ | ----------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin`                     | `str`  | `null`                  | `all`   | Name of the service that originated the message.                                                                                                      |
| `hostname`                   | `str`  | `os.hostname()`         | `all`   | Hostname of the service that originated the message.                                                                                                  |
| `datatype`                   | `str`  | `json`                  | `all`   | Datatype of the payload message.                                                                                                                      |
| `timestamp`                  | `str`  | `Date.now()`            | `all`   | Timestamp of the message creation.                                                                                                                    |
| `topic`                      | `str`  | `name.split(".", 1)[0]` | `all`   | The topic to which the message will be sent. If no topic is provided, it defaults to the first part of the string (split by `.`).                     |
| `globalDiffusion`            | `bool` | `true`                  | `all`   | Enables the global diffusion of topics.                                                                                                               |
| `producerMetadataMaxAge`     | `int`  | `300000`                | `kafka` | Period of time in milliseconds in which a force refresh of the metadata is made if no partition leadership changes are made.                          |
| `producerAutoTopicCreation`  | `bool` | `true`                  | `kafka` | Enables topic creation when if topic did not exist previously before sending the message.                                                             |
| `producerTransactionTimeout` | `int`  | `60000`                 | `kafka` | The maximum amount of time in milliseconds it waits for a delivery status updated from the producer before aborting the process.                      |
| `producerAcks`               | `int`  | `0`                     | `kafka` | Controls the number of required acks (`-1` for all replicas acknowledgements, `0` for no acknowledgments and `1` for only the leader acknowledgment). |
| `producerTimeout`            | `int`  | `30000`                 | `kafka` | The amount of time in milliseconds to await a response for acknowledgement from the message sending.                                                  |
| `producerCompression`        | `enum` | `null`                  | `kafka` | The compression codec to be applied to the message (`gzip` or `null`).                                                                                |
| `maxInFlightRequests`        | `int`  | `null`                  | `kafka` | Maximum number of requests that may be in progress concurrently. If `null` there is no limit.                                                         |

### Consumer

The consumer listens for a topic and executes a callback. The second parameter allows for a callback function or an object containing the callback and other options. The second parameter also allows for callbacks for `onSuccess` and `onError` functions if the `KafkaRetry` consumer is used. It also receives a list of `events` of interest: any event with a different name is ignored.

```javascript
bus.bind("order", message => { ... });

bus.bind("order", {
    events: ["order.created", "order.sent", "order.ready"],
    callback: message => { ... }
});

bus.bind("order", {
    events: "order.created",
    callback: message => { ... },
    onSuccess: message => { ... },
    onError: message => { ... },
    retries: 5
});
```

It is also possible to bind to multiple topics in a single call:

```javascript
bus.bind(["order", "ripe_twitch:order"], message => { ... });
```

#### Consumer options

| Name                             | Type       | Default      | Adapter      | Description                                                                                                                                                                                                           |
| -------------------------------- | ---------- | ------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events`                         | `array`    | `[]`         | `kafka`      | An array of events that will filter the messages payload `name`, only the messages with these events will be processed.                                                                                               |
| `callback`                       | `function` | `null`       | `kafka`      | The callback function that is called for each message received.                                                                                                                                                       |
| `onSuccess`                      | `function` | `null`       | `kafka`      | The callback function that is called if the message process was successful.                                                                                                                                           |
| `onError`                        | `function` | `null`       | `kafka`      | The callback function that is called if the message process was unsuccessful.                                                                                                                                         |
| `autoConfirm`                    | `bool`     | `true`       | `kafka`      | Flag that controls if the default `onSuccess` method is used when a message is successfully processed (the message is sent to topic `confirmation.success`).                                                          |
| `groupId`                        | `str`      | `ripe-kafka` | `kafka`      | Kafka consumer group ID, identifies a consumer and is unique for a given Kafka broker (more [here](https://kafka.js.org/docs/1.13.0/consuming)).                                                                      |
| `minBytes`                       | `int`      | `1`          | `kafka`      | Kafka consumer minimum amount of bytes the server should return on a fetch request.                                                                                                                                   |
| `maxBytes`                       | `int`      | `1048576`    | `kafka`      | Kafka consumer maximum amount of bytes the server should return on a fetch request.                                                                                                                                   |
| `maxWaitTimeInMs`                | `int`      | `100`        | `kafka`      | The maximum amount of time in milliseconds the consumer will block before answering the fetch request if there isn’t sufficient data to immediately satisfy the requirement given by the minimum bytes configuration. |
| `autoCommit`                     | `bool`     | `true`       | `kafka`      | Enables the auto commit of offsets to Kafka.                                                                                                                                                                          |
| `autoCommitInterval`             | `int`      | `5000`       | `kafka`      | The interval min milliseconds between each auto commit of offsets.                                                                                                                                                    |
| `autoCommitThreshold`            | `int`      | `1`          | `kafka`      | The number of messages that need to be resolved between each auto commit of offsets.                                                                                                                                  |
| `partitionsConsumedConcurrently` | `int`      | `1`          | `kafka`      | The number of partitions from which their messages can be consumed concurrently.                                                                                                                                      |
| `eachBatchAutoResolve`           | `bool`     | `true`       | `kafka`      | Enables the auto commit of offsets on a message batch processing success.                                                                                                                                             |
| `run`                            | `bool`     | `true`       | `kafka`      | Flag that controls if the consumer executes on the bind call (starts consuming messages).                                                                                                                             |
| `block`                          | `bool`     | `false`      | `kafka`      | Flag that controls if the consumer event loop is blocked.                                                                                                                                                             |
| `override`                       | `bool`     | `false`      | `kafka`      | Flag that controls if the consumer callbacks are overridden with the provided ones.                                                                                                                                   |
| `retries`                        | `int`      | `5`          | `kafkaRetry` | The maximum number of retries of a message process after its first failure. If the retries are not enough, the `onError` callback is called and the message process is aborted.                                       |
| `retryDelay`                     | `int`      | `50`         | `kafkaRetry` | The amount of time in milliseconds that is waited before retrying to process a previously failed message.                                                                                                             |
| `messageFailureMaxTime`          | `int`      | `null`       | `kafkaRetry` | The maximum amount of time in milliseconds that the retry process must last before retry of the message process is aborted.                                                                                           |
| `messageDelayExponential`        | `int`      | `2`          | `kafkaRetry` | The exponential used to increase the delay between retries of a previously failed message processing.                                                                                                                 |
| `retryPersistenceDir`            | `str`      | `data`       | `kafkaRetry` | Kafka retry consumer persistent directory that will store files for message retries.                                                                                                                                  |

## Configuration

### Global

| Name                 | Type   | Default | Description                                                                 |
| -------------------- | ------ | ------- | --------------------------------------------------------------------------- |
| **BUS_ADAPTER**      | `str`  | `kafka` | The name of the bus adapter adapter to be used (eg: `kafka`, `kafkaRetry`). |
| **GLOBAL_DIFFUSION** | `bool` | `true`  | Enables the global diffusion of topics.                                     |
### Kafka

| Name                                                | Type   | Default            | Description                                                                                                                                                                                                           |
| --------------------------------------------------- | ------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **KAFKA_HOSTS**                                     | `str`  | `localhost:9092`   | The hostname and port of the Kafka nodes to be used, separated by a `,` (comma).                                                                                                                                      |
| **KAFKA_CLIENT_ID**                                 | `str`  | `ripe-kafka`       | Kafka client ID, uniquely identifies a connection to a Kafka broker (more [here](https://kafka.js.org/docs/1.13.0/configuration)).                                                                                    |
| **KAFKA_CONNECT_TIMEOUT**                           | `int`  | `10000`            | The amount of time in milliseconds to wait for a successful connection to a Kafka broker.                                                                                                                             |
| **KAFKA_REQUEST_TIMEOUT**                           | `int`  | `30000`            | The amount of time in milliseconds to wait for a successful request to a Kafka broker.                                                                                                                                |
| **KAFKA_INITIAL_RETRY_TIME**                        | `int`  | `300`              | The amount used to calculate the retry time of a failed request to the Kafka broker.                                                                                                                                  |
| **KAFKA_MAX_RETRY_TIME**                            | `int`  | `30000`            | The maximum amount of time in milliseconds for a retry.                                                                                                                                                               |
| **KAFKA_RETRIES**                                   | `int`  | `5`                | Kafka max number of retries to be used when it fails to connect to a Kafka broker.                                                                                                                                    |
| **KAFKA_CONSUMER_GROUP_ID**                         | `str`  | `${RANDOM_STRING}` | Kafka consumer group ID, identifies a consumer and is unique for a given Kafka broker (more [here](https://kafka.js.org/docs/1.13.0/consuming)).                                                                      |
| **KAFKA_CONSUMER_FETCH_MIN_BYTES**                  | `int`  | `1`                | Kafka consumer minimum amount of bytes the server should return on a fetch request.                                                                                                                                   |
| **KAFKA_CONSUMER_FETCH_MAX_BYTES**                  | `int`  | `1048576`          | Kafka consumer maximum amount of bytes the server should return on a fetch request.                                                                                                                                   |
| **KAFKA_CONSUMER_FETCH_MAX_WAIT**                   | `int`  | `100`              | The maximum amount of time in milliseconds the consumer will block before answering the fetch request if there isn’t sufficient data to immediately satisfy the requirement given by the minimum bytes configuration. |
| **KAFKA_CONSUMER_AUTO_COMMIT**                      | `bool` | `true`             | Enables the auto commit of offsets to Kafka.                                                                                                                                                                          |
| **KAFKA_CONSUMER_AUTO_COMMIT_INTERVAL**             | `int`  | `5000`             | The interval min milliseconds between each auto commit of offsets.                                                                                                                                                    |
| **KAFKA_CONSUMER_AUTO_COMMIT_THRESHOLD**            | `int`  | `1`                | The number of messages that need to be resolved between each auto commit of offsets.                                                                                                                                  |
| **KAFKA_CONSUMER_PARTITIONS_CONSUMED_CONCURRENTLY** | `int`  | `1`                | The number of partitions from which their messages can be consumed concurrently.                                                                                                                                      |
| **KAFKA_CONSUMER_BATCH_AUTO_RESOLVE**               | `bool` | `true`             | Enables the auto commit of offsets on a message batch processing success.                                                                                                                                             |
| **KAFKA_CONSUMER_MESSAGE_FAILURE_RETRIES**          | `int`  | `5`                | The maximum number of retries of a message process after its first failure. If the retries are not enough, the `onError` callback is called and the message process is aborted.                                       |
| **KAFKA_CONSUMER_MESSAGE_FIRST_DELAY**              | `int`  | `50`               | The amount of time in milliseconds that is waited before retrying to process a previously failed message.                                                                                                             |
| **KAFKA_CONSUMER_MESSAGE_FAILURE_MAX_TIME**         | `int`  | `null`             | The maximum amount of time in milliseconds that the retry process must last before retry of the message process is aborted.                                                                                           |
| **KAFKA_CONSUMER_MESSAGE_DELAY_EXPONENTIAL**        | `int`  | `2`                | The exponential used to increase the delay between retries of a previously failed message processing.                                                                                                                 |
| **KAFKA_CONSUMER_RETRY_PERSISTENCE_DIR**            | `int`  | `2`                | Kafka retry consumer persistent directory that will store files for message retries.                                                                                                                                  |
| **KAFKA_PRODUCER_METADATA_MAX_AGE**                 | `int`  | `300000`           | Period of time in milliseconds in which a force refresh of the metadata is made if no partition leadership changes are made.                                                                                          |
| **KAFKA_PRODUCER_AUTO_TOPIC_CREATION**              | `bool` | `true`             | Enables topic creation when if topic did not exist previously before sending the message.                                                                                                                             |
| **KAFKA_PRODUCER_TRANSACTION_TIMEOUT**              | `int`  | `60000`            | The maximum amount of time in milliseconds it waits for a delivery status updated from the producer before aborting the process.                                                                                      |
| **KAFKA_PRODUCER_ACKS**                             | `int`  | `0`                | Controls the number of required acks (`-1` for all replicas acknowledgements, `0` for no acknowledgments and `1` for only the leader acknowledgment).                                                                 |
| **KAFKA_PRODUCER_TIMEOUT**                          | `int`  | `30000`            | The amount of time in milliseconds to await a response for acknowledgement from the message sending.                                                                                                                  |
| **KAFKA_PRODUCER_COMPRESSION**                      | `enum` | `null`             | The compression codec to be applied to the message (`gzip` or `null`).                                                                                                                                                |
| **KAFKA_PRODUCER_MAX_INFLIGHT_REQUESTS**            | `int`  | `null`             | Maximum number of requests that may be in progress concurrently. If `null` there is no limit.                                                                                                                         |

For more details and up-to-date information on Kafka specific configs check the [Kafka official documentation](https://kafka.apache.org/documentation/#configuration) and [KafkaJS documentation](https://kafka.js.org/docs/getting-started).

## License

RIPE Bus API (for Javascript) is currently licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/).

## Build Automation

[![Build Status](https://app.travis-ci.com/ripe-tech/ripe-bus-api-js.svg?branch=master)](https://travis-ci.com/github/ripe-tech/ripe-bus-api-js)
[![Build Status GitHub](https://github.com/ripe-tech/ripe-bus-api-js/workflows/Main%20Workflow/badge.svg)](https://github.com/ripe-tech/ripe-bus-api-js/actions)
[![npm Status](https://img.shields.io/npm/v/ripe-bus-api.svg)](https://www.npmjs.com/package/ripe-bus-api)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://www.apache.org/licenses/)
