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

The producer can send one or more messages to a specific topic. The third parameter allows to pass other options to configure the Bus client used.

```javascript
bus.trigger("order", { id: 1, ... });

bus.trigger("order", [{ id: 1, ... }, { id: 2, ... }]);

bus.trigger("order", { id: 1, ... }, { kafkaHosts: "localhost:9091" });
```

### Consumer

The consumer listens for a topic/event and executes a callback. The second parameter allows for a callback function or an object containing the callback and other options. The second parameter also allows for callbacks for `onSuccess` and `onError` functions if the `KafkaRetry` consumer is used.

```javascript
bus.bind("order", (message) => { ... });

bus.bind("order", {
    callback: (message) => { ... }
});

bus.bind("order", {
    callback: (message) => { ... },
    onSuccess: (message) => { ... },
    onError: (message) => { ... },
    retries: 5
});
```

## Configuration

For more details and up to date information on Kafka specific configs check the [Kafka official documentation](https://kafka.apache.org/documentation/#configuration).

| Name     | Type   | Mandatory | Default | Description |
| -------- | ------ | ------- | ------- |----------- |
| **BUS_ADAPTER** | `str`  | false | `kafkaRetry`    | RIPE Bus adapter |
| **KAFKA_HOSTS** | `str`  | false | `localhost:9092`    | Kafka nodes available, separated by a `,` (comma).  |
| **KAFKA_CLIENT_ID** | `str`  | false | `ripe-kafka`    | Kafka client ID  |
| **KAFKA_CONNECT_TIMEOUT** | `int`  | false | `10000`    | Kafka timeout for connections  |
| **KAFKA_REQUEST_TIMEOUT** | `int`  | false | `30000`    | Kafka timeout for requests  |
| **KAFKA_INITIAL_RETRY_TIME** | `int`  | false | `300`    | Kafka retry time  |
| **KAFKA_MAX_RETRY_TIME** | `int`  | false | `30000`    | Kafka max number of retries  |
| **KAFKA_RETRIES** | `int`  | false | `5`    | Kafka max number of retries  |
| **KAFKA_MAX_INFLIGHT_REQUESTS** | `int`  | false | `null`    | Max number of requests flowing through the cluster  |
| **KAFKA_CONSUMER_GROUP_ID** | `str`  | false | `ripe-kafka-consumer`  | Kafka consumer ID  |
| **KAFKA_CONSUMER_FETCH_MIN_BYTES** | `int`  | false | `1`  | Kafka consumer minimum bytes to fetch  |
| **KAFKA_CONSUMER_FETCH_MAX_BYTES** | `int`  | false | `1024 * 1024`  | Kafka consumer maximum bytes to fetch  |
| **KAFKA_CONSUMER_FETCH_MAX_WAIT** | `int`  | false | `100`  | Kafka consumer maximum waiting time to fetch  |
| **KAFKA_CONSUMER_AUTO_COMMIT** | `bool`  | false | `true`  | Kafka consumer auto commit  |
| **KAFKA_CONSUMER_AUTO_COMMIT_INTERVAL** | `int`  | false | `5000`  | Kafka consumer auto commit time interval  |
| **KAFKA_CONSUMER_AUTO_COMMIT_THRESHOLD** | `int`  | false | `1`  | Kafka consumer auto commit threshold|
| **KAFKA_CONSUMER_PARTITIONS_CONSUMED_CONCURRENTLY** | `int`  | false | `1`  | Kafka consumer maximum partitions to consume simultanesouly |
| **KAFKA_CONSUMER_BATCH_AUTO_RESOLVE** | `bool`  | false | `true`  | Kafka consumer auto resolve batch |
| **KAFKA_PRODUCER_METADATA_MAX_AGE** | `int`  | false | `300000`  | Kafka producer maximum age for metadata |
| **KAFKA_PRODUCER_AUTO_TOPIC_CREATION** | `bool`  | false | `true`  | Wether the Kafka producer can create topics or not |
| **KAFKA_PRODUCER_TRANSITION_TIMEOUT** | `int`  | false | `60000`  | Kafka producer transition timeout |
| **KAFKA_PRODUCER_ACKS** | `int`  | false | `0`  | Kafka producer ACKs |
| **KAFKA_PRODUCER_TIMEOUT** | `int`  | false | `30000`  | Kafka producer timeout |
| **KAFKA_PRODUCER_COMPRESSION** | `str`  | false | `null`  | Kafka producer compression used |
| **KAFKA_CONSUMER_MESSAGE_FAILURE_RETRIES** | `int`  | false | `5`  | Kafka consumer number of retries for messages |
| **KAFKA_CONSUMER_MESSAGE_FIRST_DELAY** | `int`  | false | `50`  | Kafka consumer delay before consuming first message |
| **KAFKA_CONSUMER_MESSAGE_FAILURE_MAX_TIME** | `int`  | false | `null`  | Kafka consumer maximum wait time before message failure |
| **KAFKA_CONSUMER_MESSAGE_DELAY_EXPONENTIAL** | `int`  | false | `2`  | Kafka consumer message delay exponential factor |
| **KAFKA_CONSUMER_RETRY_PERSISTENCE_DIR** | `str`  | false | `data`  | Kafka consumer persistent directory for message retries |

## License

RIPE Bus API (for Javascript) is currently licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/).

## Build Automation

[![Build Status](https://travis-ci.com/ripe-tech/ripe-bus-api-js.svg?branch=master)](https://travis-ci.com/ripe-tech/ripe-bus-api-js)
[![Build Status GitHub](https://github.com/ripe-tech/ripe-bus-api-js/workflows/Main%20Workflow/badge.svg)](https://github.com/ripe-tech/ripe-bus-api-js/actions)
[![npm Status](https://img.shields.io/npm/v/ripe-bus-api.svg)](https://www.npmjs.com/package/ripe-bus-api)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://www.apache.org/licenses/)
