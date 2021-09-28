import { Observable } from 'zen-observable-ts';
import { AliasBatchHttpLink } from './main';

jest.mock('@apollo/client/link/batch', () => ({
  BatchLink: jest.fn(),
}));

window.fetch = jest.fn();

describe('AliasBatchHttpLink', () => {
  it('does not need any constructor arguments', () => {
    expect(() => new AliasBatchHttpLink()).not.toThrow();
  });

  it('should pass batchInterval, batchDebounce, batchMax, and batchKey to BatchLink', () => {
    const BatchLink = require('@apollo/client/link/batch').BatchLink;
    const LocalScopedLink = require('./main').AliasBatchHttpLink;

    const batchKey = () => 'hi';
    const batchHandler = () => Observable.of();

    new LocalScopedLink({
      batchInterval: 20,
      batchDebounce: true,
      batchMax: 20,
      batchKey,
      batchHandler,
    });

    const {
      batchInterval,
      batchDebounce,
      batchMax,
      batchKey: batchKeyArg,
    } = BatchLink.mock.calls[0][0];

    expect(batchInterval).toBe(20);
    expect(batchDebounce).toBe(true);
    expect(batchMax).toBe(20);
    expect(batchKeyArg()).toEqual(batchKey());
  });
});
