import { Component, OnDestroy, OnInit } from '@angular/core';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Observable, ReplaySubject, filter, map, mergeMap, take, takeUntil } from 'rxjs';
import { selectRecentTransactionsByComponent } from 'src/app/store/transaction-store/state/selectors';
import { communityVaults } from './../../../../data/communityVaults.data';
import { IHeaderBodyPage } from './../../../../shared/components/header-body-page/header-body-page.component';
import { ITransactionCard, StoreState, Vault } from './../../../../shared/interfaces';
import { setAuthPublicAddress } from './../../../../store/auth-store/state/actions';
import { loadVaults } from './../../../../store/vaults-store/state/actions';
import { selectIsVaultsLoaded, selectVaults } from './../../../../store/vaults-store/state/selectors';

@Component({
  selector: 'app-community-vaults-list-page-container',
  templateUrl: './community-vaults-list-page-container.component.html',
  styleUrls: ['./community-vaults-list-page-container.component.scss']
})
export class CommunityVaultsListPageContainerComponent implements OnInit, OnDestroy {
  private destroyed$: ReplaySubject<boolean> = new ReplaySubject();
  headerPayload: IHeaderBodyPage = {
    title: $localize`:@@CommunityVault.Title:Community Vault`,
    goBackLink: null,
    description: $localize`:@@CommunityVault.Desc:Community Vault mechanism, a cornerstone feature of the Chainbrary ecosystem. It intricately details how the Community Vault functions as a dynamic system for distributing rewards, ensuring that each member's contribution to the network is recognized and fairly compensated.`
  };

  constructor(
    private readonly store: Store,
    private actions$: Actions
  ) {}

  readonly communityVaults$: Observable<StoreState<Vault | null>[]> = this.store.select(selectVaults);
  readonly isVaultsLoaded$: Observable<boolean> = this.store.select(selectIsVaultsLoaded);
  readonly transactionCards$: Observable<ITransactionCard[]> = this.store.select(
    selectRecentTransactionsByComponent('CommunityVaultsListPageContainerComponent')
  );

  get communityVaultsWithoutError$(): Observable<StoreState<Vault | null>[]> {
    return this.communityVaults$.pipe(map((vaults) => vaults.filter((vault) => vault.error === null)));
  }

  ngOnInit(): void {
    this.loadVaults();
    this.loginListener();
  }

  loginListener(): void {
    this.actions$
      .pipe(ofType(setAuthPublicAddress), takeUntil(this.destroyed$))
      .subscribe(() => this.store.dispatch(loadVaults()));
  }

  loadVaults(): void {
    this.communityVaultsWithoutError$
      .pipe(
        mergeMap((vaults) => {
          const shouldLoadMoreVaults: boolean = vaults.length < communityVaults.length;
          return this.isVaultsLoaded$.pipe(map((isLoaded) => ({ isLoaded, shouldLoadMoreVaults })));
        }),
        filter(({ isLoaded, shouldLoadMoreVaults }) => !isLoaded || shouldLoadMoreVaults),
        take(1)
      )
      .subscribe(() => this.store.dispatch(loadVaults()));
  }

  ngOnDestroy(): void {
    this.destroyed$.next(true);
    this.destroyed$.complete();
  }
}
