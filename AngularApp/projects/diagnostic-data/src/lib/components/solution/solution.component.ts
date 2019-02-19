import { Component, ViewEncapsulation, Input } from '@angular/core';
import { TelemetryService } from '../../services/telemetry/telemetry.service';
import { DataRenderBaseComponent } from '../data-render-base/data-render-base.component';
import { DiagnosticData, Rendering } from '../../models/detector';
import { SiteService } from 'projects/app-service-diagnostics/src/app/shared/services/site.service';

export class Solution {
  Title: string;
  Descriptions: string[];
  ResourceUri: string;
  RequiresConfirmation: boolean;
}

@Component({
  selector: 'solution',
  templateUrl: './solution.component.html',
  styleUrls: ['./solution.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class SolutionComponent extends DataRenderBaseComponent {

  @Input() solution: Solution;
  renderingProperties: Rendering;
  acceptRisk: boolean;

  constructor(telemetryService: TelemetryService/*, private _siteService: SiteService*/) {
    super(telemetryService);
  }

  ngOnInit() {
    if (this.solution.Descriptions == null) {
      this.solution.Descriptions = [];
    }

    this.acceptRisk = !this.solution.RequiresConfirmation;
  }

  checkAcceptRisk() {
    this.acceptRisk = !this.acceptRisk;
  }

  performAction() {
    console.log("Restarting site on solution " + this.solution.Title);
    // this._siteService.restartSiteFromUri(this.solution.ResourceUri);
  }

}
