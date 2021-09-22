# apollo-link-batch-alias
Batches multiple operations into a single HTTP request. Uses aliasies under the hood.

## Installation

`npm install apollo-link-batch-alias --save`

## Usage

```typescript
import { AliasBatchHttpLink } from 'apollo-link-batch-alias';

const link: AliasBatchHttpLink = new AliasBatchHttpLink({ uri, batchMax: 20, batchInterval: 300 });
```