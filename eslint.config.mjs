import js from "@eslint/js";
import globals from "globals";

export default [
    {
        ignores: ["node_modules/", ".omc/", "scripts/", "eslint.config.js"],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                ...globals.browser,
                // 프로젝트 IIFE 모듈 (writable: 각 파일이 const로 정의)
                App: "writable",
                ElectionData: "writable",
                MapModule: "writable",
                DataLoader: "writable",
                ElectionCalendar: "writable",
                ChartsModule: "writable",
                NECData: "writable",
                OverviewTab: "writable",
                PollTab: "writable",
                CandidateTab: "writable",
                NewsTab: "writable",
                HistoryTab: "writable",
                CouncilTab: "writable",
                ProportionalTab: "writable",
                // utils.js 전역 함수 + 상수
                escapeHtml: "writable",
                showToast: "writable",
                NEWS_PROXY_BASE: "writable",
                NEWS_FILTER_CONFIG: "writable",
                MAJOR_NEWS_HOSTS: "writable",
                isMergedGwangjuJeonnam: "writable",
                getMergedDisplayName: "writable",
                // app-state.js
                AppState: "writable",
                // views
                ElectionViews: "writable",
                DistrictMapView: "writable",
                // nav + routing
                Sidebar: "writable",
                SearchModule: "writable",
                Router: "writable",
                // window.* 런타임 데이터
                IssueEngine: "writable",
                DerivedIssuesData: "writable",
                NewsFilterConfig: "writable",
                _normalizeTrend: "writable",
                // CDN 라이브러리
                d3: "readonly",
                topojson: "readonly",
                Chart: "readonly",
            },
        },
        rules: {
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^(App|ElectionData|MapModule|DataLoader|ElectionCalendar|ChartsModule|NECData|OverviewTab|PollTab|CandidateTab|NewsTab|HistoryTab|CouncilTab|ProportionalTab|escapeHtml|showToast|NEWS_PROXY_BASE|NEWS_FILTER_CONFIG|MAJOR_NEWS_HOSTS|IssueEngine|DerivedIssuesData|NewsFilterConfig|_normalizeTrend|AppState|ElectionViews|DistrictMapView|Sidebar|SearchModule|Router|isMergedGwangjuJeonnam|getMergedDisplayName)$" }],
            "no-redeclare": "off",
            "no-console": "off",
            "no-undef": "error",
            "no-empty": "warn",
            "eqeqeq": ["warn", "smart"],
            "no-var": "warn",
            "prefer-const": "warn",
        },
    },
];
