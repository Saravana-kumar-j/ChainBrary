import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-service-card[card]',
  templateUrl: './service-card.component.html',
  styleUrls: ['./service-card.component.scss']
})
export class ServiceCardComponent {
  @Input() card: IServiceCard;
}

export interface IServiceCard {
  id: string;
  title: string;
  description: string;
  img: string;
  routerUrl: string | null;
  isDisabled?: boolean;
}
