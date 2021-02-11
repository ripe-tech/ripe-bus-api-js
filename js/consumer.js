import { NotImplementedError } from "yonius";

export class Consumer {
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

    async consume(topics, callback, options = {}) {
        throw new NotImplementedError();
    }

    async topics() {
        throw new NotImplementedError();
    }
}
