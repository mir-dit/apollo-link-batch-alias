import { Observable } from 'apollo-link';
import { AliasBatchHttpLink } from './main';

jest.mock('apollo-link-batch', () => ({
  BatchLink: jest.fn(),
}));

window.fetch = jest.fn();

describe('AliasBatchHttpLink', () => {
  it('does not need any constructor arguments', () => {
    expect(() => new AliasBatchHttpLink()).not.toThrow();
  });

  it('should pass batchInterval, batchMax, and batchKey to BatchLink', () => {
    const BatchLink = require('apollo-link-batch').BatchLink;
    const LocalScopedLink = require('./main').AliasBatchHttpLink;

    const batchKey = () => 'hi';
    const batchHandler = () => Observable.of();

    new LocalScopedLink({
      batchInterval: 20,
      batchMax: 20,
      batchKey,
      batchHandler,
    });

    const {
      batchInterval,
      batchMax,
      batchKey: batchKeyArg,
    } = BatchLink.mock.calls[0][0];

    expect(batchInterval).toBe(20);
    expect(batchMax).toBe(20);
    expect(batchKeyArg()).toEqual(batchKey());
  });
});
