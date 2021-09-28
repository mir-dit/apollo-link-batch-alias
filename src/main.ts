import { ApolloLink, Operation, FetchResult } from '@apollo/client/link/core';
import { fromError, createOperation, throwServerError } from '@apollo/client/link/utils';
import {
  serializeFetchParameter,
  selectURI,
  checkFetcher,
  selectHttpOptionsAndBody,
  createSignalIfSupported,
  fallbackHttpConfig,
  HttpOptions,
  ServerParseError,
} from '@apollo/client/link/http';
import { BatchLink } from '@apollo/client/link/batch';
import { Observable } from 'zen-observable-ts';
import combineQuery from 'graphql-combine-query';

/**
 * Transforms Operation for into HTTP results.
 * context can include the headers property, which will be passed to the fetch function
 */
export class AliasBatchHttpLink extends ApolloLink {
  private batchDebounce?: boolean;
  private batchInterval: number;
  private batchMax: number;
  private batcher: ApolloLink;

  constructor(fetchParams?: AliasBatchHttpLink.Options) {
    super();

    let {
      uri = '/graphql',
      // use default global fetch if nothing is passed in
      fetch: fetcher,
      includeExtensions,
      batchInterval,
      batchDebounce,
      batchMax,
      batchKey,
      ...requestOptions
    } = fetchParams || ({} as AliasBatchHttpLink.Options);

    // dev warnings to ensure fetch is present
    checkFetcher(fetcher);

    // fetcher is set here rather than the destructuring to ensure fetch is
    // declared before referencing it. Reference in the destructuring would cause
    // a ReferenceError
    if (!fetcher) {
      fetcher = fetch;
    }

    const linkConfig = {
      http: { includeExtensions },
      options: requestOptions.fetchOptions,
      credentials: requestOptions.credentials,
      headers: requestOptions.headers,
    };

    this.batchDebounce = batchDebounce;
    this.batchInterval = batchInterval || 10;
    this.batchMax = batchMax || 10;

    const batchHandler = (operations: Operation[]) => {
      const chosenURI = selectURI(operations[0], uri);

      const context = operations[0].getContext();

      let combiner: any = combineQuery('__compose');
      operations.forEach((operation, index) => {
        const newArr = [];
        newArr[index] = { ...operation.variables };
        combiner = combiner.addN(operation.query, newArr);
      });
      const { document, variables } = combiner;

      const clientAwarenessHeaders = {};
      if (context.clientAwareness) {
        const { name, version } = context.clientAwareness;
        if (name) {
          clientAwarenessHeaders['apollographql-client-name'] = name;
        }
        if (version) {
          clientAwarenessHeaders['apollographql-client-version'] = version;
        }
      }

      const contextConfig = {
        http: context.http,
        options: context.fetchOptions,
        credentials: context.credentials,
        headers: { ...clientAwarenessHeaders, ...context.headers },
      };

      const newOperation = createOperation(
          {},
          { query: document, operationName: '__compose', variables, context },
      );

      const loadedBody = selectHttpOptionsAndBody(
          newOperation,
          fallbackHttpConfig,
          linkConfig,
          contextConfig,
      );
      const options = loadedBody.options;

      // There's no spec for using GET with batches.
      if (options.method === 'GET') {
        return fromError<FetchResult[]>(new Error('apollo-link-batch-alias does not support GET requests'));
      }

      try {
        (options as any).body = serializeFetchParameter(loadedBody.body, 'Payload');
      } catch (parseError) {
        return fromError<FetchResult[]>(parseError);
      }

      let controller;
      if (!(options as any).signal) {
        const { controller: _controller, signal } = createSignalIfSupported();
        controller = _controller;
        if (controller) (options as any).signal = signal;
      }

      return new Observable<FetchResult[]>((observer) => {
        fetcher(chosenURI, options)
            .then((response) => {
            // Make the raw response available in the context.
              operations.forEach((operation) => operation.setContext({ response }));
              return response;
            })
            .then(parseAndCheckHttpResponse(operations))
            .then(parseCombinedResult(operations))
            .then((result) => {
            // we have data and can send it to back up the link chain
              observer.next(result);
              observer.complete();
              return result;
            })
            .catch((err) => {
              if (err.name === 'AbortError') return;
              if (err.result && err.result.errors && err.result.data) {
                observer.next(err.result);
              }

              observer.error(err);
            });

        return () => {
          // XXX support canceling this request
          // https://developers.google.com/web/updates/2017/09/abortable-fetch
          if (controller) controller.abort();
        };
      });
    };

    batchKey =
      batchKey ||
      ((operation: Operation) => {
        const context = operation.getContext();

        const contextConfig = {
          http: context.http,
          options: context.fetchOptions,
          credentials: context.credentials,
          headers: context.headers,
        };

        // may throw error if config not serializable
        return selectURI(operation, uri) + JSON.stringify(contextConfig);
      });

    this.batcher = new BatchLink({
      batchDebounce: this.batchDebounce,
      batchInterval: this.batchInterval,
      batchMax: this.batchMax,
      batchKey,
      batchHandler,
    });
  }

  request(operation: Operation): Observable<FetchResult> | null {
    return this.batcher.request(operation);
  }
}

export const parseAndCheckHttpResponse = (operations) => (response: Response) => {
  return (
    response
        .text()
        .then((bodyText) => {
          try {
            return JSON.parse(bodyText);
          } catch (err) {
            const parseError = err as ServerParseError;
            parseError.name = 'ServerParseError';
            parseError.response = response;
            parseError.statusCode = response.status;
            parseError.bodyText = bodyText;
            return Promise.reject(parseError);
          }
        })
    // TODO: when conditional types come out then result should be T extends Array ? Array<FetchResult> : FetchResult
        .then((result: any) => {
          if (response.status >= 300) {
          // Network error
            throwServerError(
                response,
                result,
                `Response not successful: Received status code ${response.status}`,
            );
          }
          // TODO should really error per response in a Batch based on properties
          //    - could be done in a validation link
          if (!result.hasOwnProperty('data') && !result.hasOwnProperty('errors')) {
          // Data error
            throwServerError(
                response,
                result,
                `Server response was missing for query '${
              Array.isArray(operations) ? operations.map((op) => op.operationName) : operations.operationName
                }'.`,
            );
          }
          return result;
        })
  );
};

export const parseCombinedResult = (operations: Operation[]) => (result) => {
  return operations.map((op, index) => {
    const selections = op.query.definitions.map((def: any) => def.selectionSet.selections).flat();

    const fields = selections.reduce((acc, s) => {
      const name: string = s.alias?.value || s.name.value;
      acc[name] = result.data[`${name}_${index}`];
      return acc;
    }, {});

    const errors = selections
        .map((s) => {
          const name: string = s.alias?.value || s.name.value;
          return result.errors?.filter((err) => err.path[0] === `${name}_${index}`) || [];
        })
        .flat();

    return { data: fields, errors: errors.length ? errors : null };
  });
};

export namespace AliasBatchHttpLink {
  export type Options = Pick<
    BatchLink.Options,
    'batchMax' | 'batchDebounce' | 'batchInterval' | 'batchKey'
  > & HttpOptions;
}
