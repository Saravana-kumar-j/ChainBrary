import { Injectable } from '@angular/core';
import { IEditAllowancePayload } from '@chainbrary/token-bridge';
import { INetworkDetail, NetworkChainId, Web3LoginService } from '@chainbrary/web3-login';
import { Actions, concatLatestFrom, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Buffer } from 'buffer';
import { catchError, filter, from, map, mergeMap, of, switchMap } from 'rxjs';
import { selectCurrentNetwork, selectNetworkSymbol, selectPublicAddress } from '../../auth-store/state/selectors';
import { showErrorNotification, showSuccessNotification } from '../../notification-store/state/actions';
import { TransactionTokenBridgeContract } from './../../../shared/contracts';
import { tokenList } from './../../../shared/data/tokenList';
import {
  IConversionToken,
  IPaymentRequest,
  IReceiptTransaction,
  IToken,
  ITokenContract,
  SendNativeTokenToMultiSigPayload,
  SendTransactionTokenBridgePayload,
  StoreState,
  TransactionTokenBridgePayload
} from './../../../shared/interfaces';
import { PriceFeedService } from './../../../shared/services/price-feed/price-feed.service';
import { TokensService } from './../../../shared/services/tokens/tokens.service';
import * as PaymentRequestActions from './actions';
import {
  selectIsNonNativeToken,
  selectPayment,
  selectPaymentConversion,
  selectPaymentNetworkIsMathing,
  selectPaymentRequestInUsdIsEnabled,
  selectPaymentToken
} from './selectors';

@Injectable()
export class PaymentRequestEffects {
  constructor(
    private actions$: Actions,
    private web3LoginService: Web3LoginService,
    private store: Store,
    private priceFeedService: PriceFeedService,
    private tokensService: TokensService
  ) {}

  isIPaymentRequest(obj: IPaymentRequest): obj is IPaymentRequest {
    return (
      typeof obj === 'object' && obj !== null && typeof obj.publicAddress === 'string' && typeof obj.amount === 'number'
    );
  }

  initPaymentRequestMaker$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(PaymentRequestActions.initPaymentRequestMaker),
      concatLatestFrom(() => [this.store.select(selectNetworkSymbol)]),
      map((payload: [ReturnType<typeof PaymentRequestActions.initPaymentRequestMaker>, string | null]) => {
        const tokenFound: IToken | null = tokenList.find((token) => token.symbol === payload[1]) || null;
        return PaymentRequestActions.selectToken({ token: tokenFound });
      })
    );
  });

  checkIfTransferIsPossible$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(PaymentRequestActions.generatePaymentRequestSuccess),
      concatLatestFrom(() => [
        this.store.select(selectPublicAddress),
        this.store.select(selectIsNonNativeToken),
        this.store.select(selectPaymentNetworkIsMathing)
      ]),
      filter(
        (
          payload: [
            ReturnType<typeof PaymentRequestActions.generatePaymentRequestSuccess>,
            string | null,
            boolean,
            boolean
          ]
        ) => payload[1] !== null && payload[2] && payload[3]
      ),
      map(
        (payload) =>
          payload as [ReturnType<typeof PaymentRequestActions.generatePaymentRequestSuccess>, string, boolean, boolean]
      ),
      switchMap(
        async (
          action: [ReturnType<typeof PaymentRequestActions.generatePaymentRequestSuccess>, string, boolean, boolean]
        ) => {
          const tokenAddress: ITokenContract | undefined = tokenList
            .find((token) => token.tokenId === action[0].paymentRequest.tokenId)
            ?.networkSupport.find((support) => support.chainId === action[0].paymentRequest.chainId);

          if (!tokenAddress) {
            return PaymentRequestActions.checkTokenAllowanceFailure({ message: 'Token address not found!' });
          }

          const payload: TransactionTokenBridgePayload = {
            ownerAdress: action[1],
            tokenAddress: tokenAddress.address,
            chainId: action[0].paymentRequest.chainId,
            amount: action[0].paymentRequest.amount
          };

          return this.tokensService
            .getTransferAvailable(payload)
            .then((isTransferable: boolean) =>
              PaymentRequestActions.smartContractCanTransferSuccess({ isTransferable })
            );
        }
      ),
      catchError((error: string) => {
        return of(PaymentRequestActions.checkTokenAllowanceFailure({ message: error }));
      })
    );
  });

  checkIfTransferIsPossibleAfterAllowance$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(PaymentRequestActions.approveTokenAllowanceSuccess),
      concatLatestFrom(() => [this.store.select(selectPublicAddress), this.store.select(selectPayment)]),
      filter(
        (
          payload: [
            ReturnType<typeof PaymentRequestActions.approveTokenAllowanceSuccess>,
            string | null,
            IPaymentRequest | null
          ]
        ) => payload[1] !== null && payload[2] !== null
      ),
      map(
        (payload) =>
          payload as [ReturnType<typeof PaymentRequestActions.approveTokenAllowanceSuccess>, string, IPaymentRequest]
      ),
      switchMap(
        async (
          action: [ReturnType<typeof PaymentRequestActions.approveTokenAllowanceSuccess>, string, IPaymentRequest]
        ) => {
          const tokenAddress: string = tokenList
            .find((token) => token.tokenId === action[2].tokenId)
            ?.networkSupport.find((support) => support.chainId === action[2].chainId)?.address as string;
          const payload: TransactionTokenBridgePayload = {
            ownerAdress: action[1],
            tokenAddress: tokenAddress,
            chainId: action[2].chainId,
            amount: action[2].amount
          };
          return this.tokensService
            .getTransferAvailable(payload)
            .then((isTransferable: boolean) =>
              PaymentRequestActions.smartContractCanTransferSuccess({ isTransferable })
            );
        }
      )
    );
  });

  approveTokenAllowance$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(PaymentRequestActions.approveTokenAllowance),
      concatLatestFrom(() => [this.store.select(selectPublicAddress), this.store.select(selectPayment)]),
      map(
        (payload) =>
          payload as [ReturnType<typeof PaymentRequestActions.approveTokenAllowance>, string, IPaymentRequest]
      ),
      mergeMap(([, publicAddress, payment]) => {
        const tokenAddress: string = tokenList
          .find((token) => token.tokenId === payment.tokenId)
          ?.networkSupport.find((support) => support.chainId === payment.chainId)?.address as string;

        const payload: IEditAllowancePayload = {
          tokenAddress: tokenAddress,
          chainId: payment.chainId,
          owner: publicAddress,
          spender: new TransactionTokenBridgeContract(payment.chainId).getAddress(),
          amount: payment.amount
        };

        return from(this.tokensService.approve(payload)).pipe(
          map((result: boolean) =>
            result
              ? PaymentRequestActions.approveTokenAllowanceSuccess()
              : PaymentRequestActions.approveTokenAllowanceFailure({ errorMessage: 'Error approving token' })
          ),
          catchError((error: Error) =>
            of(PaymentRequestActions.approveTokenAllowanceFailure({ errorMessage: error.message }))
          )
        );
      })
    );
  });

  applyConversionToken$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(PaymentRequestActions.applyConversionToken),
      concatLatestFrom(() => [
        this.store.select(selectPaymentToken),
        this.store.select(selectCurrentNetwork),
        this.store.select(selectPaymentRequestInUsdIsEnabled)
      ]),
      filter((payload) => payload[1] !== null && payload[2] !== null),
      map(
        (
          payload: [
            ReturnType<typeof PaymentRequestActions.applyConversionToken>,
            IToken | null,
            INetworkDetail | null | null,
            boolean
          ]
        ) =>
          payload as [
            ReturnType<typeof PaymentRequestActions.applyConversionToken>,
            IToken | null,
            INetworkDetail,
            boolean
          ]
      ),
      switchMap(
        async (
          payload: [
            ReturnType<typeof PaymentRequestActions.applyConversionToken>,
            IToken | null,
            INetworkDetail,
            boolean
          ]
        ) => {
          let price: number;
          const tokenFound: IToken = tokenList.find(
            (token) => token.nativeToChainId === payload[1]?.nativeToChainId && token.tokenId === payload[1]?.tokenId
          ) as IToken;

          // If the token is the native token of the network, we get the price of the native token
          if (tokenFound?.nativeToChainId === payload[2].chainId) {
            price = await this.priceFeedService.getCurrentPriceOfNativeToken(payload[2].chainId);
          } else {
            const priceFeed = tokenFound?.networkSupport.find(
              (network: ITokenContract) => network.chainId === payload[2].chainId
            )?.priceFeed[0];

            // If the token is not supported by the network, we return 0
            if (priceFeed === undefined) {
              return PaymentRequestActions.applyConversionTokenSuccess({
                usdAmount: 0,
                tokenAmount: payload[0].amount
              });
            }
            // If the token is supported by the network, we get the price of the token
            price = await this.priceFeedService.getCurrentPrice(priceFeed, payload[2].chainId);
          }

          // Set up the price based on USD
          if (payload[3]) {
            return PaymentRequestActions.applyConversionTokenSuccess({
              usdAmount: payload[0].amount,
              tokenAmount: payload[0].amount / price
            });
          }
          // Set up the price based on the token
          else
            return PaymentRequestActions.applyConversionTokenSuccess({
              usdAmount: price * payload[0].amount,
              tokenAmount: payload[0].amount
            });
        }
      )
    );
  });

  selectToken$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(PaymentRequestActions.updatedToken),
      concatLatestFrom(() => [
        this.store.select(selectPaymentConversion),
        this.store.select(selectPaymentRequestInUsdIsEnabled)
      ]),
      map((payload: [ReturnType<typeof PaymentRequestActions.updatedToken>, StoreState<IConversionToken>, boolean]) => {
        if (payload[2]) {
          return PaymentRequestActions.applyConversionToken({
            amount: payload[1].data.usdAmount ? payload[1].data.usdAmount : 0
          });
        } else {
          return PaymentRequestActions.applyConversionToken({ amount: payload[1].data.tokenAmount as number });
        }
      })
    );
  });

  generatePayment$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(PaymentRequestActions.generatePaymentRequest),
      map((action: ReturnType<typeof PaymentRequestActions.generatePaymentRequest>) => {
        const decodedPayment = Buffer.from(
          action.encodedRequest.replace('+', '-').replace('/', '_'),
          'base64'
        ).toString('utf-8');
        const decodedPaymentRequest: IPaymentRequest = JSON.parse(decodedPayment);
        if (this.isIPaymentRequest(decodedPaymentRequest)) {
          return PaymentRequestActions.generatePaymentRequestSuccess({
            paymentRequest: decodedPaymentRequest,
            token: tokenList.find((token) => token.tokenId === decodedPaymentRequest.tokenId) as IToken,
            network: this.web3LoginService.getNetworkDetailByChainId(decodedPaymentRequest.chainId)
          });
        } else {
          return PaymentRequestActions.generatePaymentRequestFailure({
            errorMessage: 'Error decoding payment request'
          });
        }
      }),
      catchError(() =>
        of(
          PaymentRequestActions.generatePaymentRequestFailure({
            errorMessage: 'Error decoding payment request'
          })
        )
      )
    );
  });

  sendAmountTransactionsError$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(PaymentRequestActions.amountSentFailure, PaymentRequestActions.checkTokenAllowanceFailure),
      map(
        (
          action: ReturnType<
            typeof PaymentRequestActions.amountSentFailure | typeof PaymentRequestActions.checkTokenAllowanceFailure
          >
        ) => showErrorNotification({ message: action.message })
      )
    );
  });

  sendAmountTransactionsSuccess$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(PaymentRequestActions.amountSentSuccess),
      filter((action: ReturnType<typeof PaymentRequestActions.amountSentSuccess>) => action.numberConfirmation == 1),
      map(() => showSuccessNotification({ message: 'Transaction is processing' }))
    );
  });

  sendNonNativeToken$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(PaymentRequestActions.sendAmount),
      concatLatestFrom(() => [
        this.store.select(selectPublicAddress),
        this.store.select(selectPayment),
        this.store.select(selectIsNonNativeToken)
      ]),
      filter((payload) => payload[1] !== null && payload[3]),
      map(
        (payload) => payload as [ReturnType<typeof PaymentRequestActions.sendAmount>, string, IPaymentRequest, boolean]
      ),
      switchMap((action: [ReturnType<typeof PaymentRequestActions.sendAmount>, string, IPaymentRequest, boolean]) => {
        const tokenAddress: string = tokenList
          .find((token) => token.tokenId === action[2].tokenId)
          ?.networkSupport.find((support) => support.chainId === action[2].chainId)?.address as string;
        const payload: SendTransactionTokenBridgePayload = {
          tokenAddress: tokenAddress,
          chainId: action[2].chainId,
          amount: action[2].amount,
          ownerAdress: action[1],
          destinationAddress: action[2].publicAddress
        };
        return from(this.tokensService.transferNonNativeToken(payload)).pipe(
          map((receipt: IReceiptTransaction) =>
            PaymentRequestActions.amountSent({
              hash: receipt.transactionHash,
              chainId: action[2].chainId as NetworkChainId
            })
          ),
          catchError((error: Error) => of(PaymentRequestActions.amountSentFailure({ message: error.message })))
        );
      })
    );
  });

  sendNativeToken$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(PaymentRequestActions.sendAmount),
      concatLatestFrom(() => [
        this.store.select(selectPublicAddress),
        this.store.select(selectPayment),
        this.store.select(selectIsNonNativeToken)
      ]),
      filter((payload) => !payload[3]),
      switchMap(
        (
          action: [ReturnType<typeof PaymentRequestActions.sendAmount>, string | null, IPaymentRequest | null, boolean]
        ) => {
          const payload: SendNativeTokenToMultiSigPayload = {
            addresses: [action[2]?.publicAddress as string],
            amount: Number(action[0].priceValue),
            chainId: action[2]?.chainId as NetworkChainId,
            from: action[1] as string
          };
          return from(this.tokensService.transferNativeToken(payload)).pipe(
            map((receipt: IReceiptTransaction) =>
              PaymentRequestActions.amountSent({
                hash: receipt.transactionHash,
                chainId: action[2]?.chainId as NetworkChainId
              })
            ),
            catchError((error: Error) => of(PaymentRequestActions.amountSentFailure({ message: error.message })))
          );
        }
      )
    );
  });
}
