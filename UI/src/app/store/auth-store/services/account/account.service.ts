import { Injectable } from '@angular/core';
import { ApolloQueryResult } from '@apollo/client/core';
import { Apollo, gql } from 'apollo-angular';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { IOrganization, IProfileAdded } from './../../../../shared/interfaces';

@Injectable({
  providedIn: 'root'
})
export class AccountService {
  organizationName = environment.organizationName;

  constructor(private apollo: Apollo) {}

  getAccountByPublicAddress(
    userAddress: string
  ): Observable<ApolloQueryResult<{ memberAccountSaveds: IProfileAdded[]; organizationSaveds: IOrganization[] }>> {
    return this.apollo.query({
      query: gql`
        query ($userAddress: String!, $organizationName: String!) {
          memberAccountSaveds(
            orderBy: blockTimestamp
            orderDirection: desc
            first: 1
            where: { userAddress: $userAddress }
          ) {
            id
            blockNumber
            blockTimestamp
            description
            expirationDate
            imgUrl
            organizationKey
            transactionHash
            userName
            userAddress
          }
          organizationSaveds(
            orderBy: blockTimestamp
            orderDirection: desc
            first: 1
            where: { key: $organizationName }
          ) {
            key
            pricePerDay
          }
        }
      `,
      variables: {
        userAddress,
        organizationName: this.organizationName
      }
    });
  }
}
