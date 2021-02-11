import { NotImplementedError } from "yonius";

export class Producer {
    constructor(owner, options = {}) {
        this.owner = owner;
    }

    static async build(options = {}) {
        throw new NotImplementedError();
    }

    async connect() {
        throw new NotImplementedError();
    }

    async disconnect() {
        throw new NotImplementedError();
    }

    async produce(topic, message, options = {}) {
        throw new NotImplementedError();
    }

    async topics() {
        throw new NotImplementedError();
    }
}
