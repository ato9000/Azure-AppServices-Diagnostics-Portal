import { HealthStatus } from "diagnostic-data";

export abstract class StepFlow {
    public id: string;
    public title: string;
    public description?: string;
    abstract run(flowMgr: StepFlowManager): Promise<void>;
}

export enum StepViewType {
    promise,
    dropdown,
    check,
    input,
    info
}

// for angular component variable binding
export class StepViewContainer {
    public stepView: StepView;

    constructor(view: StepView) {
        this.set(view);
    }
    public set(view: StepView) {
        this.stepView = view;
        view.container = this;
    }
}

export abstract class StepView {
    public id: string;
    public type: StepViewType;
    public container: StepViewContainer;

    constructor(view: { id: string, type: StepViewType }) {
        this.type = view.type;
        this.id = view.id;
    }
}

export class PromiseStepView extends StepView {
    public message: string;
    public promise: Promise<StepView>;
    constructor(view: any) {
        super(view);
        this.message = view.message;
        this.promise = view.promise;
    }
}

export class DropdownStepView extends StepView {
    public dropdowns: {
        description?: string,
        options: string[],
        defaultChecked?: number,
        placeholder: string
    }[];
    public width: string;
    public bordered: boolean;
    public description: string;
    public callback: (dropdownIdx: number, selectedIdx: number) => Promise<void>;
    constructor(view: any) {
        super(view);
        this.type = StepViewType.dropdown;
        this.dropdowns = view.dropdowns;
        this.callback = view.callback;
        this.bordered = view.bordered || false;
        this.width = view.width || "100%";
        this.description = view.description || undefined;
    }
}

enum checkResultLevel {
    pass,
    warning,
    fail,
    pending,
    loading,
    error,
    hidden
}

export class CheckStepView extends StepView {
    public title: string;
    public level: number;
    public get status(): HealthStatus {
        return this._convertLevelToHealthStatus(this.level);
    }
    private _convertLevelToHealthStatus(level: checkResultLevel): HealthStatus {
        switch (level) {
            case checkResultLevel.pass:
                return HealthStatus.Success;
            case checkResultLevel.fail:
                return HealthStatus.Critical;
            case checkResultLevel.warning:
                return HealthStatus.Warning;
            case checkResultLevel.pending:
                return HealthStatus.Info;
            case checkResultLevel.error:
                return HealthStatus.Info;
        }
        return HealthStatus.None;
    }

    constructor(view: any) {
        super(view);
        this.title = view.title;
        this.level = view.level;
    }
}

enum InfoType {
    recommendation,
    diagnostic
}

export class InfoStepView extends StepView {
    public title: string;
    public infoType: InfoType;
    public markdown: string;

    constructor(view: any) {
        super(view);
        this.title = view.title;
        this.infoType = view.infoType;
        this.markdown = this._markdownPreprocess(view.markdown, view.id);
    }

    private _markdownPreprocess(markdown: string, id: string): string {
        if (markdown == null) {
            return null;
        }
        // parse markdown links to html <a> tag
        var result = markdown.replace(/(?<!\!)\[(.*?)]\((.*?)( +\"(.*?)\")?\)/g, `<a target="_blank" href="$2" title="$4" onclick="window.networkCheckLinkClickEventLogger('${id}','$2', '$1')">$1</a>`);
        return result;
    }
}

export class InputStepView extends StepView {
    public title: string;
    public placeholder: string;
    public entry:string;
    public buttonText: string;
    public tooltip: string;
    public callback: (input: string) => Promise<void>;

    constructor(view: any) {
        super(view);
        this.title = view.title;
        this.placeholder = view.placeholder;
        this.buttonText = view.buttonText;
        this.tooltip = view.tooltip;
        this.callback = view.callback;
        this.entry = view.entry;
    }
}


export class StepFlowManager {
    public stepViews: StepViewContainer[];
    private _stepViewQueue: PromiseCompletionSource<StepView[]>[];
    private _currentFlow: StepFlow;
    private _executionCount = 0;
    private _stepViewQueueMap: number[];
    public loadingView: { loadingText: string };
    private _defaultLoadingText = "Loading...";
    constructor(views: StepViewContainer[]) {
        this.stepViews = views;
        this._stepViewQueue = [new PromiseCompletionSource<StepView[]>()];
        this._stepViewQueueMap = [];
        this._execute();
    }

    public setFlow(flow: StepFlow) {
        this._currentFlow = flow;
        flow.run(this.generateMgrForFlow(flow));
    }

    private endFlow() {
        this._stepViewQueue[this._stepViewQueue.length - 1].resolve(null);
    }

    public reset(idx: number) {
        this.endFlow();
        this._stepViewQueue.length = idx + 1;
        if (this._stepViewQueueMap[idx] != null) {
            this.stepViews.length = this._stepViewQueueMap[idx];
        }
        this._stepViewQueue.push(new PromiseCompletionSource<StepView[]>());
        this._execute(idx + 1);
    }

    private async _execute(idx: number = 0) {
        ++this._executionCount;
        var currentCnt = this._executionCount;
        var stepViewQueue = this._stepViewQueue;
        while (idx < stepViewQueue.length && currentCnt == this._executionCount) {
            try {
                this.loadingView = stepViewQueue[idx];
                var views = await stepViewQueue[idx];
                if (views == null || currentCnt != this._executionCount) {
                    break;
                }

                for (var i = 0; i < views.length; ++i) {
                    var view = views[i];
                    view.id = view.id || this._currentFlow.id + `_${idx}`;

                    switch (view.type) {
                        case StepViewType.dropdown:
                            view = new DropdownStepView(view);
                            break;
                        case StepViewType.check:
                            view = new CheckStepView(view);
                            break;
                        case StepViewType.info:
                            view = new InfoStepView(view);
                            break;
                        case StepViewType.input:
                            view = new InputStepView(view);
                            break;
                    }
                    this.stepViews.push(new StepViewContainer(view));
                }
            }
            catch (error) {
                console.log(error);
            }
            this._stepViewQueueMap[idx] = this.stepViews.length;
            ++idx;
        }
    }

    public addView(viewPromise: StepView | Promise<StepView>, loadingText?:string) {
        return this.addViews(Promise.resolve(viewPromise).then(v => [v]), loadingText);
    }

    public addViews(viewPromise: StepView[] | Promise<StepView[]>, loadingText?:string) {
        var idx = this._stepViewQueue.length - 1;
        this._stepViewQueue.push(new PromiseCompletionSource<StepView[]>());
        this._stepViewQueue[idx].resolve(viewPromise);
        this._stepViewQueue[idx].loadingText = loadingText || this._defaultLoadingText;
        return idx;
    }

    private generateAddViewsFunc(flow: StepFlow){
        var addViews = this.addViews.bind(this);
        return (viewPromise: StepView[] | Promise<StepView[]>, loadingText?:string):number => {
            if(this._currentFlow != flow){
                return;
            }
            return addViews(viewPromise, loadingText);
        };
    }

    private generateMgrForFlow(flow: StepFlow){
        var mgr = {...this}
        mgr.addViews = this.generateAddViewsFunc(flow);
        mgr.addView = this.addView;
        mgr.reset = this.reset.bind(this);
        return mgr;
    }
}


function delay(second: number): Promise<void> {
    return new Promise(resolve =>
        setTimeout(resolve, second * 1000));
}

class PromiseCompletionSource<T> extends Promise<T>{
    private _resolve: (value: T | PromiseLike<T>) => void;
    private _reject: (reason?: any) => void;
    public loadingText: string;

    constructor(timeoutInSec?: number) {
        var _resolve: (value: T | PromiseLike<T>) => void;
        var _reject: (reason?: any) => void;
        super((resolve, reject) => {
            _resolve = resolve;
            _reject = reject;
        });

        this._resolve = _resolve;
        this._reject = _reject;

        if (timeoutInSec != null) {
            delay(timeoutInSec).then(() => {
                this._reject(`Timeout after ${timeoutInSec} seconds!`);
            });
        }
    }

    resolve(val: T | PromiseLike<T>) {
        this._resolve(val);
    }
}