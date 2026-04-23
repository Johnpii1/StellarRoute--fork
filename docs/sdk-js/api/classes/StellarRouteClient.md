# Class: StellarRouteClient

Defined in: src/client.ts:30

## Constructors

### Constructor

> **new StellarRouteClient**(`baseUrl?`): `StellarRouteClient`

Defined in: src/client.ts:33

#### Parameters

##### baseUrl?

`string` = `'http://localhost:8080'`

#### Returns

`StellarRouteClient`

## Methods

### getHealth()

> **getHealth**(`opts?`): `Promise`\<[`HealthStatus`](../interfaces/HealthStatus.md)\>

Defined in: src/client.ts:92

#### Parameters

##### opts?

`FetchOptions`

#### Returns

`Promise`\<[`HealthStatus`](../interfaces/HealthStatus.md)\>

***

### getOrderbook()

> **getOrderbook**(`base`, `quote`, `opts?`): `Promise`\<[`Orderbook`](../interfaces/Orderbook.md)\>

Defined in: src/client.ts:100

#### Parameters

##### base

`string`

##### quote

`string`

##### opts?

`FetchOptions`

#### Returns

`Promise`\<[`Orderbook`](../interfaces/Orderbook.md)\>

***

### getPairs()

> **getPairs**(`opts?`): `Promise`\<[`PairsResponse`](../interfaces/PairsResponse.md)\>

Defined in: src/client.ts:96

#### Parameters

##### opts?

`FetchOptions`

#### Returns

`Promise`\<[`PairsResponse`](../interfaces/PairsResponse.md)\>

***

### getQuote()

> **getQuote**(`base`, `quote`, `amount?`, `type?`, `opts?`): `Promise`\<[`PriceQuote`](../interfaces/PriceQuote.md)\>

Defined in: src/client.ts:109

#### Parameters

##### base

`string`

##### quote

`string`

##### amount?

`number`

##### type?

[`QuoteType`](../type-aliases/QuoteType.md) = `'sell'`

##### opts?

`FetchOptions`

#### Returns

`Promise`\<[`PriceQuote`](../interfaces/PriceQuote.md)\>

***

### getRoutes()

> **getRoutes**(`base`, `quote`, `amount?`, `type?`, `opts?`): `Promise`\<[`PathStep`](../interfaces/PathStep.md)[]\>

Defined in: src/client.ts:122

#### Parameters

##### base

`string`

##### quote

`string`

##### amount?

`number`

##### type?

[`QuoteType`](../type-aliases/QuoteType.md) = `'sell'`

##### opts?

`FetchOptions`

#### Returns

`Promise`\<[`PathStep`](../interfaces/PathStep.md)[]\>
