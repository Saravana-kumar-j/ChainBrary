import { Injectable } from '@angular/core';
import { INetworkDetail, Web3LoginService } from '@chainbrary/web3-login';
import { Store } from '@ngrx/store';
import { Observable, combineLatest, map } from 'rxjs';
import { selectCurrentNetwork } from './../../../store/auth-store/state/selectors';

@Injectable({
  providedIn: 'root'
})
export class WalletService {
  private networkOnStore$: Observable<INetworkDetail | null>;

  constructor(
    private web3LoginService: Web3LoginService,
    private store: Store
  ) {
    this.networkOnStore$ = this.store.select(selectCurrentNetwork);
  }

  get networkIsMatching$(): Observable<boolean> {
    return combineLatest([this.web3LoginService.currentNetwork$, this.networkOnStore$]).pipe(
      map(
        ([currentNetwork, networkOnStore]) =>
          networkOnStore !== null && currentNetwork?.chainId === networkOnStore?.chainId
      )
    );
  }

  get netWorkOnWallet$(): Observable<INetworkDetail | null> {
    return this.web3LoginService.currentNetwork$;
  }

  formatErrorMessage(code: number): string {
    switch (code) {
      case -32002:
        return $localize`:@@ErrorMessage.WalletAlreadyProcessing:Wallet is already processing another request`;
      case -32000:
        return $localize`:@@ErrorMessage.WalletNotEnoughBalance:Wallet connect has not enough balance to pay for the transaction`;
      case 4001:
        return $localize`:@@ErrorMessage.TransactionRejected:Transaction rejected by wallet`;
      default:
        return $localize`:@@ErrorMessage.TransactionError:An error occurred while sending the transaction on the wallet`;
    }
  }
}
