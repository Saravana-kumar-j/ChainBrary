import { Injectable } from '@angular/core';
import { WalletProvider, Web3LoginService } from '@chainbrary/web3-login';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { delay, filter, map, switchMap, tap } from 'rxjs';
import { showErrorNotification, showSuccessNotification } from '../../notification-store/state/actions';
import { AuthService } from './../../../shared/services/auth/auth.service';
import { WalletService } from './../../../shared/services/wallet/wallet.service';
import * as AuthActions from './actions';

@Injectable()
export class AuthEffects {
  constructor(
    private actions$: Actions,
    private authService: AuthService,
    private web3LoginService: Web3LoginService,
    private walletService: WalletService
  ) {}

  setAuthPublicAddress$ = createEffect(
    () => {
      return this.actions$.pipe(
        ofType(AuthActions.setAuthPublicAddress),
        tap((action: ReturnType<typeof AuthActions.setAuthPublicAddress>) => {
          this.authService.saveWalletConnected({
            publicAddress: action.publicAddress,
            network: action.network,
            walletProvider: action.wallet
          });
          this.web3LoginService.closeLoginModal();
        })
      );
    },
    { dispatch: false }
  );

  balanceChecking = createEffect(() => {
    return this.actions$.pipe(
      ofType(AuthActions.setAuthPublicAddress, AuthActions.networkChangeSuccess, AuthActions.accountChanged),
      filter(() => !!this.authService.getRecentWallet()),
      switchMap(() => {
        const recentWallet: WalletProvider = this.authService.getRecentWallet() as WalletProvider;
        return this.web3LoginService
          .getCurrentBalance(recentWallet)
          .pipe(map((response: number) => AuthActions.saveBalance({ balance: response })));
      })
    );
  });

  addressChecking$ = createEffect(
    () => {
      return this.actions$.pipe(
        ofType(AuthActions.addressChecking),
        filter(() => !!this.authService.getRecentWallet()),
        map(() => {
          const recentWallet = this.authService.getRecentWallet() as WalletProvider;
          this.web3LoginService.retreiveWalletProvider(recentWallet);
        })
      );
    },
    { dispatch: false }
  );

  resetAuth$ = createEffect(
    () => {
      return this.actions$.pipe(
        ofType(AuthActions.resetAuth),
        tap(() => {
          this.authService.removePublicAddress();
          this.authService.removechainId();
        })
      );
    },
    { dispatch: false }
  );

  errorAccountTransactions$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(AuthActions.deleteAccountFailure),
      map((action: { message: string }) => showErrorNotification({ message: action.message }))
    );
  });

  successAccountTransactions$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(AuthActions.deleteAccountSuccess),
      filter((action: { numberConfirmation: number }) => action.numberConfirmation == 1),
      map(() =>
        showSuccessNotification({
          message: $localize`:@@ResponseMessage.TransactionIsProcessing:Transaction is processing`
        })
      )
    );
  });

  networkChangeSuccess$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(AuthActions.networkChangeSuccess),
      tap((action: ReturnType<typeof AuthActions.networkChangeSuccess>) => {
        this.authService.savechainId(action.network.chainId);
      }),
      map(() => showSuccessNotification({ message: $localize`:@@ResponseMessage.NetworkIsUpdated:Network is updated` }))
    );
  });

  networkChangeError$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(AuthActions.networkChangeFailure),
      map((action: ReturnType<typeof AuthActions.networkChangeFailure>) =>
        showErrorNotification({ message: action.message })
      )
    );
  });

  addNetworkToWallet$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(AuthActions.addNetworkToWallet),
      delay(1000),
      switchMap(async (action: ReturnType<typeof AuthActions.addNetworkToWallet>) => {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: action.network.networkVersion,
                chainName: action.network.name,
                rpcUrls: action.network.rpcUrls,
                nativeCurrency: action.network.nativeCurrency,
                blockExplorerUrls: [action.network.blockExplorerUrls]
              }
            ]
          });
          return AuthActions.addNetworkToWalletSuccess({ network: action.network });
        } catch (error: unknown) {
          const errorPayload = error as { code: number; message: string };
          return AuthActions.addNetworkToWalletFailure({
            message:
              errorPayload.message ||
              $localize`:@@ResponseMessage.AnUnexpectedErrorOccurred:An unexpected error occurred`
          });
        }
      })
    );
  });

  errorWallet$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(AuthActions.walletError),
      map((action: ReturnType<typeof AuthActions.walletError>) =>
        showErrorNotification({ message: this.walletService.formatErrorMessage(action.code) })
      )
    );
  });

  networkChanges$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(AuthActions.networkChange),
      switchMap(async (action: ReturnType<typeof AuthActions.networkChange>) => {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: action.network.chainId }]
          });
          return AuthActions.networkChangeSuccessOutside();
        } catch (error: unknown) {
          const errorPayload = error as { code: number; message: string };
          if (errorPayload.code === 4902) {
            return AuthActions.addNetworkToWallet({ network: action.network });
          } else {
            return AuthActions.networkChangeFailure({
              message:
                errorPayload.message ||
                $localize`:@@ResponseMessage.AnUnexpectedErrorOccurred:An unexpected error occurred`
            });
          }
        }
      })
    );
  });

  accountChanged$ = createEffect(
    () => {
      return this.actions$.pipe(
        ofType(AuthActions.accountChanged),
        filter((action: ReturnType<typeof AuthActions.accountChanged>) => !!action.publicAddress),
        tap((action: ReturnType<typeof AuthActions.accountChanged>) =>
          this.authService.savePublicAddress(action.publicAddress as string)
        )
      );
    },
    { dispatch: false }
  );

  logOutFromWallet$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(AuthActions.accountChanged),
      filter((action: ReturnType<typeof AuthActions.accountChanged>) => !action.publicAddress),
      map(() => AuthActions.resetAuth())
    );
  });
}
