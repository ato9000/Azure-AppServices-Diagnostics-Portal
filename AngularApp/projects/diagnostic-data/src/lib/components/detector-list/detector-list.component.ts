import { BehaviorSubject, forkJoin as observableForkJoin, Observable, of } from 'rxjs';
import { map } from 'rxjs/internal/operators/map';
import { catchError } from 'rxjs/operators';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { Component, Pipe, PipeTransform, Inject, OnInit } from '@angular/core';
import {
  DetectorListRendering, DetectorMetaData, DetectorResponse, DiagnosticData, DownTime, HealthStatus
} from '../../models/detector';
import { LoadingStatus } from '../../models/loading';
import { StatusStyles } from '../../models/styles';
import { DetectorControlService } from '../../services/detector-control.service';
import { DiagnosticService } from '../../services/diagnostic.service';
import { TelemetryEventNames } from '../../services/telemetry/telemetry.common';
import { TelemetryService } from '../../services/telemetry/telemetry.service';
import { DataRenderBaseComponent } from '../data-render-base/data-render-base.component';
import { ParseResourceService } from '../../services/parse-resource.service';
import { DIAGNOSTIC_DATA_CONFIG, DiagnosticDataConfig } from '../../config/diagnostic-data-config';
import { Insight, InsightUtils } from '../../models/insight';
import { Solution } from '../solution/solution';
import { ActivatedRoute, Router } from '@angular/router';
import { PortalActionGenericService } from '../../services/portal-action.service';
import { FeatureNavigationService } from '../../services/feature-navigation.service';
import { UriUtilities } from '../../utilities/uri-utilities';



@Component({
  selector: 'detector-list',
  templateUrl: './detector-list.component.html',
  styleUrls: ['./detector-list.component.scss'],
  animations: [
    trigger('expand', [
      state('shown', style({ height: '*' })),
      state('hidden', style({ height: '0px', visibility: 'hidden' })),
      transition('* => *', animate('.25s'))
    ])
  ]
})
export class DetectorListComponent extends DataRenderBaseComponent {

  LoadingStatus = LoadingStatus;
  renderingProperties: DetectorListRendering;
  detectorMetaData: DetectorMetaData[];
  detectorViewModels: DetectorViewModel[] = [];
  DetectorStatus = HealthStatus;
  private childDetectorsEventProperties = {};
  overrideResourceUri: string = "";
  resourceType: string = "";
  errorMsg: string = "";
  internalErrorMsg: string = "";
  isPublic: boolean;
  imgSrc: string = "";
  resourceText: string = "";


  issueDetectedViewModels: DetectorViewModeWithInsightInfo[] = [];
  successfulViewModels: DetectorViewModeWithInsightInfo[] = [];
  allSolutionsMap: Map<string, Solution[]> = new Map<string, Solution[]>();
  solutionPanelOpenSubject: BehaviorSubject<boolean> = new BehaviorSubject(false);
  allSolutions: Solution[] = [];
  solutionTitle:string = "";
  loading = LoadingStatus.Loading;

  constructor(private _diagnosticService: DiagnosticService, protected telemetryService: TelemetryService, private _detectorControl: DetectorControlService, private parseResourceService: ParseResourceService, @Inject(DIAGNOSTIC_DATA_CONFIG) private config: DiagnosticDataConfig, private _router: Router, private _activatedRoute: ActivatedRoute, private _portalActionService: PortalActionGenericService,private _featureNavigationService:FeatureNavigationService) {
    super(telemetryService);
    this.isPublic = this.config && this.config.isPublic;
  }

  protected processData(data: DiagnosticData) {
    super.processData(data);
    this.renderingProperties = <DetectorListRendering>data.renderingProperties;
    this.getResponseFromResource();
  }

  private getResponseFromResource() {
    let isFromDependentResource = this.checkIsFromDependentResource();
    if (isFromDependentResource) {
      this.parseResourceService.checkIsResourceSupport(this.overrideResourceUri, false).subscribe(error => {
        this.internalErrorMsg = error;
        if (error === "") {
          this.resourceType = this.parseResourceService.resourceType;
          this.imgSrc = this.parseResourceService.resource.imgSrc;

          if (this.isPublic) {
            this.resourceText = `Showing diagnostics from the dependent resource type: ${this.resourceType}`;
          } else {
            this.resourceText = `Showing detectors from the dependent resource type: ${this.resourceType}`;
          }

          this.logEvent("DependentChildDetectorsLoaded", {
            DependentResourceUri: this.overrideResourceUri,
            DependentResourceType: this.resourceType
          });
          this.getDetectorResponses();
        }
      });
    } else {
      //From parent resource
      this.getDetectorResponses();
    }
  }

  private getDetectorResponses(): void {
    this._diagnosticService.getDetectors(this.overrideResourceUri).subscribe(detectors => {
      this.startDetectorRendering(detectors, null, false);
    },(error => {
        if (this.overrideResourceUri !== "") {
          const e = JSON.parse(error);
          let code: string = "";
          if (e && e.error && e.error.code) {
            code = e.error.code;
          }
          switch (code) {
            case "InvalidAuthenticationTokenTenant":
              this.errorMsg = `No Access for resource ${this.resourceType} , please check your access`;
              break;

            case "":
              break;

            default:
              this.errorMsg = code;
              break;
          }
        }
    }));
  }

  public retryRequest(metaData: any) {
    metaData.loadingStatus = LoadingStatus.Loading;
    metaData.request.subscribe(
      (response: DetectorResponse) => {
        metaData = this.updateDetectorViewModelSuccess(metaData, response);
      },
      (error) => {
        metaData.loadingStatus = LoadingStatus.Failed;
      });
  }

  private getDetectorViewModel(detector: DetectorMetaData, additionalParams?: string, overwriteResourceUrl?: string): DetectorViewModel {
    let queryString = null;
    if (additionalParams) {
      let contextToPass = <Object>JSON.parse(additionalParams);
      queryString = '';
      for (var key in contextToPass) {
        if (contextToPass.hasOwnProperty(key)) {
          queryString += `&${key}=${encodeURIComponent(contextToPass[key])}`;
        }
      }
    }
    const viewModel: DetectorViewModel = {
      title: detector.name,
      metadata: detector,
      loadingStatus: LoadingStatus.Loading,
      status: null,
      statusColor: null,
      statusIcon: null,
      expanded: false,
      response: null,
      request: this._diagnosticService.getDetector(detector.id, this._detectorControl.startTimeString, this._detectorControl.endTimeString, this._detectorControl.shouldRefresh, this._detectorControl.isInternalView, queryString, overwriteResourceUrl)
    };

    return viewModel;
  }

  private updateDetectorViewModelSuccess(viewModel: DetectorViewModel, res: DetectorResponse) {
    const status = res.status.statusId;

    viewModel.loadingStatus = LoadingStatus.Success,
      viewModel.status = status;
    viewModel.statusColor = StatusStyles.getColorByStatus(status),
      viewModel.statusIcon = StatusStyles.getIconByStatus(status),
      viewModel.response = res;
    return viewModel;
  }

  toggleDetectorHeaderStatus(viewModel: any) {
    viewModel.expanded = viewModel.loadingStatus === LoadingStatus.Success && !viewModel.expanded;
    const clickDetectorEventProperties = {
      'ChildDetectorName': viewModel.title,
      'ChildDetectorId': viewModel.metadata.id,
      'IsExpanded': viewModel.expanded,
      'Status': viewModel.status
    };

    // Log children detectors click
    this.logEvent(TelemetryEventNames.ChildDetectorClicked, clickDetectorEventProperties);
  }

  checkIsFromDependentResource(): boolean {
    if (!this.renderingProperties.resourceUri || this.renderingProperties.resourceUri === "") return false;
    this.overrideResourceUri = this.renderingProperties.resourceUri;

    return true;
  }


  //Get from detector-list-analysis
  startDetectorRendering(detectorList: DetectorMetaData[], downTime: DownTime, containsDownTime: boolean) {
    this.issueDetectedViewModels = [];
    const requests: Observable<any>[] = [];

    this.detectorMetaData = detectorList.filter(detector => this.renderingProperties.detectorIds.indexOf(detector.id) >= 0);
    this.detectorViewModels = this.detectorMetaData.map(detector => this.getDetectorViewModel(detector, this.renderingProperties.additionalParams, this.overrideResourceUri));
    if(this.detectorViewModels.length === 0) {
      this.loading = LoadingStatus.Success;
    }
    this.detectorViewModels.forEach((viewModel, index) => {
      requests.push((<Observable<DetectorResponse>>viewModel.request).pipe(
        map((response: DetectorResponse) => {
          this.detectorViewModels[index] = this.updateDetectorViewModelSuccess(viewModel, response);

          this.loading = this.detectorViewModels.findIndex(vm => vm.loadingStatus === LoadingStatus.Loading) > -1 ? LoadingStatus.Loading : LoadingStatus.Success;

          if (this.detectorViewModels[index].loadingStatus !== LoadingStatus.Failed) {
            if (this.detectorViewModels[index].status === HealthStatus.Critical || this.detectorViewModels[index].status === HealthStatus.Warning) {
              this.getInsightSolutions(this.detectorViewModels[index]);
              let insightInfo = this.getDetectorInsightInfo(this.detectorViewModels[index]);
              let issueDetectedViewModel: DetectorViewModeWithInsightInfo = { model: this.detectorViewModels[index], ...insightInfo };

              if (this.issueDetectedViewModels.length > 0) {
                this.issueDetectedViewModels = this.issueDetectedViewModels.filter(iVM => (!!iVM.model && !!iVM.model.metadata && !!iVM.model.metadata.id && iVM.model.metadata.id != issueDetectedViewModel.model.metadata.id));
              }

              this.issueDetectedViewModels.push(issueDetectedViewModel);
              this.issueDetectedViewModels = this.issueDetectedViewModels.sort((n1, n2) => {
                return n1.model.status - n2.model.status
              });
            } else {
              let insightInfo = this.getDetectorInsightInfo(this.detectorViewModels[index]);
              let successViewModel: DetectorViewModeWithInsightInfo = { model: this.detectorViewModels[index], ...insightInfo };

              if (this.successfulViewModels.length > 0) {
                this.successfulViewModels = this.successfulViewModels.filter(sVM => (!!sVM.model && !!sVM.model.metadata && !!sVM.model.metadata.id && sVM.model.metadata.id != successViewModel.model.metadata.id));
              }

              this.successfulViewModels.push(successViewModel);
            }
          }

          return {
            'ChildDetectorName': this.detectorViewModels[index].title,
            'ChildDetectorId': this.detectorViewModels[index].metadata.id,
            'ChildDetectorStatus': this.detectorViewModels[index].status,
            'ChildDetectorLoadingStatus': this.detectorViewModels[index].loadingStatus
          };
        })
        , catchError(err => {
          this.detectorViewModels[index].loadingStatus = LoadingStatus.Failed;
          return of({});
        })
      ));
    });

    // Log all the children detectors
    observableForkJoin(requests).subscribe(childDetectorData => {
      setTimeout(() => {
        let dataOutput = {};
        dataOutput["status"] = true;
        dataOutput["data"] = {
          // 'searchMode': this.searchMode,
          // 'detectors': this.detectors,
          'successfulViewModels': this.successfulViewModels,
          'issueDetectedViewModels': this.issueDetectedViewModels
        };

        // this.onComplete.emit(dataOutput);
      }, 10);

      // this.childDetectorsEventProperties['ChildDetectorsList'] = JSON.stringify(childDetectorData);
      // if (this.searchId && this.searchId.length > 0) {
      //     this.childDetectorsEventProperties['SearchId'] = this.searchId;
      // }
      this.logEvent(TelemetryEventNames.ChildDetectorsSummary, this.childDetectorsEventProperties);
    });
  }

  getDetectorInsightInfo(viewModel: DetectorViewModel): BasicInsightInfo {
    let allInsights: Insight[] = InsightUtils.parseAllInsightsFromResponse(viewModel.response);
    let insightInfo: BasicInsightInfo = {
      insightTitle: "",
      insightDescription: ""
    }
    if (allInsights.length > 0) {

      let detectorInsight = allInsights.find(i => i.status === viewModel.status);
      if (detectorInsight == null) {
        detectorInsight = allInsights[0];
      }

      let description: string = null;
      if (detectorInsight.hasData()) {
        description = detectorInsight.data["Description"];
      }
      insightInfo.insightTitle = detectorInsight.title;
      insightInfo.insightDescription = description;
    }
    return insightInfo;
  }

  private getInsightSolutions(viewModel: DetectorViewModel) {
    let allInsights: Insight[] = InsightUtils.parseAllInsightsFromResponse(viewModel.response);
    const solutions: Solution[] = [];
      allInsights.forEach(i => {
        if (i.solutions != null && i.solutions.length > 0) {
          i.solutions.forEach(s => {
            if (solutions.findIndex(x => x.Name === s.Name) === -1) {
              solutions.push(s);
            }
          });
          this.allSolutionsMap.set(viewModel.title, solutions);
        }
      });
  }

  public selectDetector(viewModel: DetectorViewModeWithInsightInfo) {
    if (viewModel != null && viewModel.model.metadata.id) {
      let targetDetector = viewModel.model.metadata.id;

      if (targetDetector !== "") {
        const clickDetectorEventProperties = {
          'ChildDetectorName': viewModel.model.title,
          'ChildDetectorId': viewModel.model.metadata.id,
          'IsExpanded': true,
          'Status': viewModel.model.status,
          // 'SearchMode': this.searchMode
        };

        // Log children detectors click
        this.logEvent(TelemetryEventNames.ChildDetectorClicked, clickDetectorEventProperties);
        const queryParams = UriUtilities.removeChildDetectorStartAndEndTime(this._activatedRoute.snapshot.queryParams);
        if (targetDetector === 'appchanges' && !this.isPublic) {
          this._portalActionService.openChangeAnalysisBlade(this._detectorControl.startTimeString, this._detectorControl.endTimeString);
        } else {
          const resourceId = this._diagnosticService.resourceId;
          const routeUrl = this.isPublic ? `resource${resourceId}/detectors/${targetDetector}` : `${resourceId}/detectors/${targetDetector}`;
          this._router.navigate([routeUrl],{
            queryParams: queryParams
          });
        }
      }
    }
  }

  openSolutionPanel(title: string) {
    this.allSolutions = this.allSolutionsMap.get(title);
    this.solutionTitle = `${title} Solution`;
    this.solutionPanelOpenSubject.next(true);
  }
}

@Pipe({
  name: 'detectorOrder',
  pure: false
})
export class DetectorOrderPipe implements PipeTransform {
  transform(items: any[]) {
    return items.sort((a, b) => {
      return a.status > b.status ? 1 : -1;
    });
  }
}

interface DetectorViewModel {
  title: string;
  metadata: DetectorMetaData;
  loadingStatus: LoadingStatus;
  status: HealthStatus;
  statusColor: string;
  statusIcon: string;
  expanded: boolean;
  response: DetectorResponse;
  request: Observable<DetectorResponse>
}

interface BasicInsightInfo {
  insightTitle: string;
  insightDescription: string;
}

interface DetectorViewModeWithInsightInfo extends BasicInsightInfo{
  model: DetectorViewModel;
}
