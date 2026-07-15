import colors from 'piccolore';
import { parse, stringify as stringify$1, unflatten as unflatten$1 } from 'devalue';
import 'es-module-lexer';
import { serialize, parse as parse$1 } from 'cookie';
import { escape } from 'html-escaper';
import { clsx } from 'clsx';
import { decodeBase64, encodeBase64, decodeHex, encodeHexUpperCase } from '@oslojs/encoding';
import * as z from 'zod/v4';
import { createStorage } from 'unstorage';
import React__default, { memo, createElement } from 'react';
import ReactDOM from 'react-dom/server';
import fs, { createReadStream } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import enableDestroy from 'server-destroy';
import os from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Http2ServerResponse } from 'node:http2';
import url from 'node:url';
import send from 'send';
let AstroError, ExpectedImage, FailedToFetchRemoteImageDimensions, IncompatibleDescriptorOptions, LocalImageUsedWrongly, MissingImageDimension, NoImageMetadata, RemoteImageNotAllowed, UnsupportedImageFormat, isRemotePath, UnsupportedImageConversion, InvalidImageService, ExpectedImageOptions, ExpectedNotESMImage, ImageMissingAlt, addAttribute, renderTemplate, isRemoteAllowed, joinPaths, FontFamilyNotFound, MissingGetFontFileRequestUrl, maybeRenderHead, isParentDirectory, InvalidComponentArgs, renderComponent, renderHead, removeQueryString, spreadAttributes, defineScriptVars, unescapeHTML, MissingSharp, handler, options, startServer;
let __tla = (async ()=>{
    function appendForwardSlash(path) {
        return path.endsWith("/") ? path : path + "/";
    }
    function prependForwardSlash$1(path) {
        return path[0] === "/" ? path : "/" + path;
    }
    const MANY_LEADING_SLASHES = /^\/{2,}/;
    function collapseDuplicateLeadingSlashes(path) {
        if (!path) {
            return path;
        }
        return path.replace(MANY_LEADING_SLASHES, "/");
    }
    const MANY_SLASHES = /\/{2,}/g;
    function collapseDuplicateSlashes(path) {
        if (!path) {
            return path;
        }
        return path.replace(MANY_SLASHES, "/");
    }
    const MANY_TRAILING_SLASHES = /\/{2,}$/g;
    function collapseDuplicateTrailingSlashes(path, trailingSlash) {
        if (!path) {
            return path;
        }
        return path.replace(MANY_TRAILING_SLASHES, trailingSlash ? "/" : "") || "/";
    }
    function removeTrailingForwardSlash(path) {
        return path.endsWith("/") ? path.slice(0, path.length - 1) : path;
    }
    function removeLeadingForwardSlash(path) {
        return path.startsWith("/") ? path.substring(1) : path;
    }
    function trimSlashes(path) {
        return path.replace(/^\/|\/$/g, "");
    }
    function isString(path) {
        return typeof path === "string" || path instanceof String;
    }
    const INTERNAL_PREFIXES = new Set([
        "/_",
        "/@",
        "/.",
        "//"
    ]);
    const JUST_SLASHES = /^\/{2,}$/;
    function isInternalPath(path) {
        return INTERNAL_PREFIXES.has(path.slice(0, 2)) && !JUST_SLASHES.test(path);
    }
    joinPaths = function(...paths) {
        return paths.filter(isString).map((path, i)=>{
            if (i === 0) {
                return removeTrailingForwardSlash(path);
            } else if (i === paths.length - 1) {
                return removeLeadingForwardSlash(path);
            } else {
                return trimSlashes(path);
            }
        }).join("/");
    };
    removeQueryString = function(path) {
        const index = path.lastIndexOf("?");
        return index > 0 ? path.substring(0, index) : path;
    };
    isRemotePath = function(src) {
        if (!src) return false;
        const trimmed = src.trim();
        if (!trimmed) return false;
        let decoded = trimmed;
        let previousDecoded = "";
        let maxIterations = 10;
        while(decoded !== previousDecoded && maxIterations > 0){
            previousDecoded = decoded;
            try {
                decoded = decodeURIComponent(decoded);
            } catch  {
                break;
            }
            maxIterations--;
        }
        if (/^[a-zA-Z]:/.test(decoded)) {
            return false;
        }
        if (decoded[0] === "/" && /^\/[\w.@-]/.test(decoded)) {
            return false;
        }
        if (decoded[0] === "\\") {
            return true;
        }
        if (decoded.startsWith("//")) {
            return true;
        }
        try {
            const url = new URL(decoded, "http://n");
            if (url.username || url.password) {
                return true;
            }
            if (decoded.includes("@") && !url.pathname.includes("@") && !url.search.includes("@")) {
                return true;
            }
            if (url.origin !== "http://n") {
                const protocol = url.protocol.toLowerCase();
                if (protocol === "file:") {
                    return false;
                }
                return true;
            }
            if (URL.canParse(decoded)) {
                return true;
            }
            return false;
        } catch  {
            return true;
        }
    };
    isParentDirectory = function(parentPath, childPath) {
        if (!parentPath || !childPath) {
            return false;
        }
        if (parentPath.includes("://") || childPath.includes("://")) {
            return false;
        }
        if (isRemotePath(parentPath) || isRemotePath(childPath)) {
            return false;
        }
        if (parentPath.includes("..") || childPath.includes("..")) {
            return false;
        }
        if (parentPath.includes("\0") || childPath.includes("\0")) {
            return false;
        }
        const normalizedParent = appendForwardSlash(slash(parentPath).toLowerCase());
        const normalizedChild = slash(childPath).toLowerCase();
        if (normalizedParent === normalizedChild || normalizedParent === normalizedChild + "/") {
            return false;
        }
        return normalizedChild.startsWith(normalizedParent);
    };
    function slash(path) {
        return path.replace(/\\/g, "/");
    }
    function fileExtension(path) {
        const ext = path.split(".").pop();
        return ext !== path ? `.${ext}` : "";
    }
    const WITH_FILE_EXT = /\/[^/]+\.\w+$/;
    function hasFileExtension(path) {
        return WITH_FILE_EXT.test(path);
    }
    const ACTION_QUERY_PARAMS = {
        actionName: "_action"
    };
    const ACTION_RPC_ROUTE_PATTERN = "/_actions/[...path]";
    const __vite_import_meta_env__$1 = {
        "ASSETS_PREFIX": undefined,
        "BASE_URL": "/",
        "DEV": false,
        "MODE": "production",
        "PROD": true,
        "SITE": undefined,
        "SSR": true
    };
    const codeToStatusMap = {
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        PAYMENT_REQUIRED: 402,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        METHOD_NOT_ALLOWED: 405,
        NOT_ACCEPTABLE: 406,
        PROXY_AUTHENTICATION_REQUIRED: 407,
        REQUEST_TIMEOUT: 408,
        CONFLICT: 409,
        GONE: 410,
        LENGTH_REQUIRED: 411,
        PRECONDITION_FAILED: 412,
        CONTENT_TOO_LARGE: 413,
        URI_TOO_LONG: 414,
        UNSUPPORTED_MEDIA_TYPE: 415,
        RANGE_NOT_SATISFIABLE: 416,
        EXPECTATION_FAILED: 417,
        MISDIRECTED_REQUEST: 421,
        UNPROCESSABLE_CONTENT: 422,
        LOCKED: 423,
        FAILED_DEPENDENCY: 424,
        TOO_EARLY: 425,
        UPGRADE_REQUIRED: 426,
        PRECONDITION_REQUIRED: 428,
        TOO_MANY_REQUESTS: 429,
        REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
        UNAVAILABLE_FOR_LEGAL_REASONS: 451,
        INTERNAL_SERVER_ERROR: 500,
        NOT_IMPLEMENTED: 501,
        BAD_GATEWAY: 502,
        SERVICE_UNAVAILABLE: 503,
        GATEWAY_TIMEOUT: 504,
        HTTP_VERSION_NOT_SUPPORTED: 505,
        VARIANT_ALSO_NEGOTIATES: 506,
        INSUFFICIENT_STORAGE: 507,
        LOOP_DETECTED: 508,
        NETWORK_AUTHENTICATION_REQUIRED: 511
    };
    const statusToCodeMap = Object.fromEntries(Object.entries(codeToStatusMap).map(([key, value])=>[
            value,
            key
        ]));
    class ActionError extends Error {
        type = "AstroActionError";
        code = "INTERNAL_SERVER_ERROR";
        status = 500;
        constructor(params){
            super(params.message);
            this.code = params.code;
            this.status = ActionError.codeToStatus(params.code);
            if (params.stack) {
                this.stack = params.stack;
            }
        }
        static codeToStatus(code) {
            return codeToStatusMap[code];
        }
        static statusToCode(status) {
            return statusToCodeMap[status] ?? "INTERNAL_SERVER_ERROR";
        }
        static fromJson(body) {
            if (isInputError(body)) {
                return new ActionInputError(body.issues);
            }
            if (isActionError(body)) {
                return new ActionError(body);
            }
            return new ActionError({
                code: "INTERNAL_SERVER_ERROR"
            });
        }
    }
    function isActionError(error) {
        return typeof error === "object" && error != null && "type" in error && error.type === "AstroActionError";
    }
    function isInputError(error) {
        return typeof error === "object" && error != null && "type" in error && error.type === "AstroActionInputError" && "issues" in error && Array.isArray(error.issues);
    }
    class ActionInputError extends ActionError {
        type = "AstroActionInputError";
        issues;
        fields;
        constructor(issues){
            super({
                message: `Failed to validate: ${JSON.stringify(issues, null, 2)}`,
                code: "BAD_REQUEST"
            });
            this.issues = issues;
            this.fields = {};
            for (const issue of issues){
                if (issue.path.length > 0) {
                    const key = issue.path[0].toString();
                    this.fields[key] ??= [];
                    this.fields[key]?.push(issue.message);
                }
            }
        }
    }
    function deserializeActionResult(res) {
        if (res.type === "error") {
            let json;
            try {
                json = JSON.parse(res.body);
            } catch  {
                return {
                    data: void 0,
                    error: new ActionError({
                        message: res.body,
                        code: "INTERNAL_SERVER_ERROR"
                    })
                };
            }
            if (Object.assign(__vite_import_meta_env__$1, {
                _: "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/.bin/astro"
            })?.PROD) {
                return {
                    error: ActionError.fromJson(json),
                    data: void 0
                };
            } else {
                const error = ActionError.fromJson(json);
                error.stack = actionResultErrorStack.get();
                return {
                    error,
                    data: void 0
                };
            }
        }
        if (res.type === "empty") {
            return {
                data: void 0,
                error: void 0
            };
        }
        return {
            data: parse(res.body, {
                URL: (href)=>new URL(href)
            }),
            error: void 0
        };
    }
    const actionResultErrorStack = (function actionResultErrorStackFn() {
        let errorStack;
        return {
            set (stack) {
                errorStack = stack;
            },
            get () {
                return errorStack;
            }
        };
    })();
    function getActionQueryString(name) {
        const searchParams = new URLSearchParams({
            [ACTION_QUERY_PARAMS.actionName]: name
        });
        return `?${searchParams.toString()}`;
    }
    function shouldAppendForwardSlash(trailingSlash, buildFormat) {
        switch(trailingSlash){
            case "always":
                return true;
            case "never":
                return false;
            case "ignore":
                {
                    switch(buildFormat){
                        case "directory":
                            return true;
                        case "preserve":
                        case "file":
                            return false;
                    }
                }
        }
    }
    const ASTRO_VERSION = "6.4.4";
    const ASTRO_GENERATOR = `Astro v${ASTRO_VERSION}`;
    const REROUTE_DIRECTIVE_HEADER = "X-Astro-Reroute";
    const REWRITE_DIRECTIVE_HEADER_KEY = "X-Astro-Rewrite";
    const REWRITE_DIRECTIVE_HEADER_VALUE = "yes";
    const NOOP_MIDDLEWARE_HEADER = "X-Astro-Noop";
    const ROUTE_TYPE_HEADER = "X-Astro-Route-Type";
    const INTERNAL_RESPONSE_HEADERS = [
        REROUTE_DIRECTIVE_HEADER,
        REWRITE_DIRECTIVE_HEADER_KEY,
        NOOP_MIDDLEWARE_HEADER,
        ROUTE_TYPE_HEADER
    ];
    const ASTRO_ERROR_HEADER = "X-Astro-Error";
    const DEFAULT_404_COMPONENT = "astro-default-404.astro";
    const REDIRECT_STATUS_CODES = [
        301,
        302,
        303,
        307,
        308,
        300,
        304
    ];
    const REROUTABLE_STATUS_CODES = [
        404,
        500
    ];
    const clientAddressSymbol = Symbol.for("astro.clientAddress");
    const originPathnameSymbol = Symbol.for("astro.originPathname");
    const pipelineSymbol = Symbol.for("astro.pipeline");
    const fetchStateSymbol = Symbol.for("astro.fetchState");
    const appSymbol = Symbol.for("astro.app");
    const nodeRequestAbortControllerCleanupSymbol = Symbol.for("astro.nodeRequestAbortControllerCleanup");
    const responseSentSymbol$1 = Symbol.for("astro.responseSent");
    const ClientAddressNotAvailable = {
        name: "ClientAddressNotAvailable",
        title: "`Astro.clientAddress` is not available in current adapter.",
        message: (adapterName)=>`\`Astro.clientAddress\` is not available in the \`${adapterName}\` adapter. File an issue with the adapter to add support.`
    };
    const PrerenderClientAddressNotAvailable = {
        name: "PrerenderClientAddressNotAvailable",
        title: "`Astro.clientAddress` cannot be used inside prerendered routes.",
        message: (name)=>`\`Astro.clientAddress\` cannot be used inside prerendered route ${name}.`
    };
    const StaticClientAddressNotAvailable = {
        name: "StaticClientAddressNotAvailable",
        title: "`Astro.clientAddress` is not available in prerendered pages.",
        message: "`Astro.clientAddress` is only available on pages that are server-rendered.",
        hint: "See https://docs.astro.build/en/guides/on-demand-rendering/ for more information on how to enable SSR."
    };
    const NoMatchingStaticPathFound = {
        name: "NoMatchingStaticPathFound",
        title: "No static path found for requested path.",
        message: (pathName)=>`A \`getStaticPaths()\` route pattern was matched, but no matching static path was found for requested path \`${pathName}\`.`,
        hint: (possibleRoutes)=>`Possible dynamic routes being matched: ${possibleRoutes.join(", ")}.`
    };
    const OnlyResponseCanBeReturned = {
        name: "OnlyResponseCanBeReturned",
        title: "Invalid type returned by Astro page.",
        message: (route, returnedValue)=>`Route \`${route ? route : ""}\` returned a \`${returnedValue}\`. Only a [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) can be returned from Astro files.`,
        hint: "See https://docs.astro.build/en/guides/on-demand-rendering/#response for more information."
    };
    const MissingMediaQueryDirective = {
        name: "MissingMediaQueryDirective",
        title: "Missing value for `client:media` directive.",
        message: 'Media query not provided for `client:media` directive. A media query similar to `client:media="(max-width: 600px)"` must be provided.'
    };
    const NoMatchingRenderer = {
        name: "NoMatchingRenderer",
        title: "No matching renderer found.",
        message: (componentName, componentExtension, plural, validRenderersCount)=>`Unable to render \`${componentName}\`.

${validRenderersCount > 0 ? `There ${plural ? "are" : "is"} ${validRenderersCount} renderer${plural ? "s" : ""} configured in your \`astro.config.mjs\` file,
but ${plural ? "none were" : "it was not"} able to server-side render \`${componentName}\`.` : `No valid renderer was found ${componentExtension ? `for the \`.${componentExtension}\` file extension.` : `for this file extension.`}`}`,
        hint: (probableRenderers)=>`Did you mean to enable the ${probableRenderers} integration?

See https://docs.astro.build/en/guides/framework-components/ for more information on how to install and configure integrations.`
    };
    const NoClientOnlyHint = {
        name: "NoClientOnlyHint",
        title: "Missing hint on client:only directive.",
        message: (componentName)=>`Unable to render \`${componentName}\`. When using the \`client:only\` hydration strategy, Astro needs a hint to use the correct renderer.`,
        hint: (probableRenderers)=>`Did you mean to pass \`client:only="${probableRenderers}"\`? See https://docs.astro.build/en/reference/directives-reference/#clientonly for more information on \`client:only\`.`
    };
    const InvalidGetStaticPathsEntry = {
        name: "InvalidGetStaticPathsEntry",
        title: "Invalid entry inside `getStaticPaths()`'s return value.",
        message: (entryType)=>`Invalid entry returned by \`getStaticPaths()\`. Expected an object, got \`${entryType}\`.`,
        hint: "If you're using a `.map` call, you might be looking for `.flatMap()` instead. See https://docs.astro.build/en/reference/routing-reference/#getstaticpaths for more information on `getStaticPaths()`."
    };
    const InvalidGetStaticPathsReturn = {
        name: "InvalidGetStaticPathsReturn",
        title: "Invalid value returned by `getStaticPaths()`.",
        message: (returnType)=>`Invalid type returned by \`getStaticPaths()\`. Expected an \`array\`, got \`${returnType}\`.`,
        hint: "See https://docs.astro.build/en/reference/routing-reference/#getstaticpaths for more information on `getStaticPaths()`."
    };
    const GetStaticPathsExpectedParams = {
        name: "GetStaticPathsExpectedParams",
        title: "Missing params property on `getStaticPaths()` route.",
        message: "Missing or empty required `params` property on `getStaticPaths()` route.",
        hint: "See https://docs.astro.build/en/reference/routing-reference/#getstaticpaths for more information on `getStaticPaths()`."
    };
    const GetStaticPathsInvalidRouteParam = {
        name: "GetStaticPathsInvalidRouteParam",
        title: "Invalid route parameter returned by `getStaticPaths()`.",
        message: (key, value, valueType)=>`Invalid \`getStaticPaths()\` route parameter for \`${key}\`. Expected a string or undefined, received \`${valueType}\` (\`${value}\`).`,
        hint: "See https://docs.astro.build/en/reference/routing-reference/#getstaticpaths for more information on `getStaticPaths()`."
    };
    const GetStaticPathsRequired = {
        name: "GetStaticPathsRequired",
        title: "`getStaticPaths()` function required for dynamic routes.",
        message: "`getStaticPaths()` function is required for dynamic routes. Make sure that you `export` a `getStaticPaths()` function from your dynamic route.",
        hint: `See https://docs.astro.build/en/guides/routing/#dynamic-routes for more information on dynamic routes.

	If you meant for this route to be server-rendered, set \`export const prerender = false;\` in the page.`
    };
    const ReservedSlotName = {
        name: "ReservedSlotName",
        title: "Invalid slot name.",
        message: (slotName)=>`Unable to create a slot named \`${slotName}\`. \`${slotName}\` is a reserved slot name. Please update the name of this slot.`
    };
    const NoMatchingImport = {
        name: "NoMatchingImport",
        title: "No import found for component.",
        message: (componentName)=>`Could not render \`${componentName}\`. No matching import has been found for \`${componentName}\`.`,
        hint: "Please make sure the component is properly imported."
    };
    InvalidComponentArgs = {
        name: "InvalidComponentArgs",
        title: "Invalid component arguments.",
        message: (name)=>`Invalid arguments passed to${name ? ` <${name}>` : ""} component.`,
        hint: "Astro components cannot be rendered directly via function call, such as `Component()` or `{items.map(Component)}`."
    };
    const PageNumberParamNotFound = {
        name: "PageNumberParamNotFound",
        title: "Page number param not found.",
        message: (paramName)=>`[paginate()] page number param \`${paramName}\` not found in your filepath.`,
        hint: "Rename your file to `[page].astro` or `[...page].astro`."
    };
    ImageMissingAlt = {
        name: "ImageMissingAlt",
        title: 'Image missing required "alt" property.',
        message: 'Image missing "alt" property. "alt" text is required to describe important images on the page.',
        hint: 'Use an empty string ("") for decorative images.'
    };
    InvalidImageService = {
        name: "InvalidImageService",
        title: "Error while loading image service.",
        message: "There was an error loading the configured image service. Please see the stack trace for more information."
    };
    MissingImageDimension = {
        name: "MissingImageDimension",
        title: "Missing image dimensions.",
        message: (missingDimension, imageURL)=>`Missing ${missingDimension === "both" ? "width and height attributes" : `${missingDimension} attribute`} for ${imageURL}. When using remote images, both dimensions are required in order to avoid CLS.`,
        hint: "If your image is inside your `src` folder, you probably meant to import it instead. See [the Imports guide for more information](https://docs.astro.build/en/guides/imports/#other-assets). You can also use `inferSize={true}` for remote images to get the original dimensions."
    };
    FailedToFetchRemoteImageDimensions = {
        name: "FailedToFetchRemoteImageDimensions",
        title: "Failed to retrieve remote image dimensions.",
        message: (imageURL)=>`Failed to get the dimensions for ${imageURL}.`,
        hint: "Verify your remote image URL is accurate, and that you are not using `inferSize` with a file located in your `public/` folder."
    };
    RemoteImageNotAllowed = {
        name: "RemoteImageNotAllowed",
        title: "Remote image is not allowed.",
        message: (imageURL)=>`Remote image ${imageURL} is not allowed by your image configuration.`,
        hint: "Update `image.domains` or `image.remotePatterns`, or remove `inferSize` for this image."
    };
    UnsupportedImageFormat = {
        name: "UnsupportedImageFormat",
        title: "Unsupported image format.",
        message: (format, imagePath, supportedFormats)=>`Received unsupported format \`${format}\` from \`${imagePath}\`. Currently only ${supportedFormats.join(", ")} are supported by our image services.`,
        hint: "Using an `img` tag directly instead of the `Image` component might be what you're looking for."
    };
    UnsupportedImageConversion = {
        name: "UnsupportedImageConversion",
        title: "Unsupported image conversion.",
        message: "Converting between vector (such as SVGs) and raster (such as PNGs and JPEGs) images is not currently supported."
    };
    const PrerenderDynamicEndpointPathCollide = {
        name: "PrerenderDynamicEndpointPathCollide",
        title: "Prerendered dynamic endpoint has path collision.",
        message: (pathname)=>`Could not render \`${pathname}\` with an \`undefined\` param as the generated path will collide during prerendering. Prevent passing \`undefined\` as \`params\` for the endpoint's \`getStaticPaths()\` function, or add an additional extension to the endpoint's filename.`,
        hint: (filename)=>`Rename \`${filename}\` to \`${filename.replace(/\.(?:js|ts)/, (m)=>`.json` + m)}\``
    };
    ExpectedImage = {
        name: "ExpectedImage",
        title: "Expected src to be an image.",
        message: (src, typeofOptions, fullOptions)=>`Expected \`src\` property for \`getImage\` or \`<Image />\` to be either an ESM imported image or a string with the path of a remote image. Received \`${src}\` (type: \`${typeofOptions}\`).

Full serialized options received: \`${fullOptions}\`.`,
        hint: "This error can often happen because of a wrong path. Make sure the path to your image is correct. If you're passing an async function, make sure to call and await it."
    };
    ExpectedImageOptions = {
        name: "ExpectedImageOptions",
        title: "Expected image options.",
        message: (options)=>`Expected \`getImage()\` parameter to be an object. Received \`${options}\`.`
    };
    ExpectedNotESMImage = {
        name: "ExpectedNotESMImage",
        title: "Expected image options, not an ESM-imported image.",
        message: "An ESM-imported image cannot be passed directly to `getImage()`. Instead, pass an object with the image in the `src` property.",
        hint: "Try changing `getImage(myImage)` to `getImage({ src: myImage })`"
    };
    IncompatibleDescriptorOptions = {
        name: "IncompatibleDescriptorOptions",
        title: "Cannot set both `densities` and `widths`.",
        message: "Only one of `densities` or `widths` can be specified. In most cases, you'll probably want to use only `widths` if you require specific widths.",
        hint: "Those attributes are used to construct a `srcset` attribute, which cannot have both `x` and `w` descriptors."
    };
    NoImageMetadata = {
        name: "NoImageMetadata",
        title: "Could not process image metadata.",
        message: (imagePath)=>`Could not process image metadata${imagePath ? ` for \`${imagePath}\`` : ""}.`,
        hint: "This is often caused by a corrupted or malformed image. Re-exporting the image from your image editor may fix this issue."
    };
    const ResponseSentError = {
        name: "ResponseSentError",
        title: "Unable to set response.",
        message: "The response has already been sent to the browser and cannot be altered."
    };
    const MiddlewareNoDataOrNextCalled = {
        name: "MiddlewareNoDataOrNextCalled",
        title: "The middleware didn't return a `Response`.",
        message: "Make sure your middleware returns a `Response` object, either directly or by returning the `Response` from calling the `next` function."
    };
    const MiddlewareNotAResponse = {
        name: "MiddlewareNotAResponse",
        title: "The middleware returned something that is not a `Response` object.",
        message: "Any data returned from middleware must be a valid `Response` object."
    };
    const EndpointDidNotReturnAResponse = {
        name: "EndpointDidNotReturnAResponse",
        title: "The endpoint did not return a `Response`.",
        message: "An endpoint must return either a `Response`, or a `Promise` that resolves with a `Response`."
    };
    const LocalsNotAnObject = {
        name: "LocalsNotAnObject",
        title: "Value assigned to `locals` is not accepted.",
        message: "`locals` can only be assigned to an object. Other values like numbers, strings, etc. are not accepted.",
        hint: "If you tried to remove some information from the `locals` object, try to use `delete` or set the property to `undefined`."
    };
    const LocalsReassigned = {
        name: "LocalsReassigned",
        title: "`locals` must not be reassigned.",
        message: "`locals` cannot be assigned directly.",
        hint: "Set a `locals` property instead."
    };
    const AstroResponseHeadersReassigned = {
        name: "AstroResponseHeadersReassigned",
        title: "`Astro.response.headers` must not be reassigned.",
        message: "Individual headers can be added to and removed from `Astro.response.headers`, but it must not be replaced with another instance of `Headers` altogether.",
        hint: "Consider using `Astro.response.headers.add()`, and `Astro.response.headers.delete()`."
    };
    LocalImageUsedWrongly = {
        name: "LocalImageUsedWrongly",
        title: "Local images must be imported.",
        message: (imageFilePath)=>`\`Image\`'s and \`getImage\`'s \`src\` parameter must be an imported image or a URL, it cannot be a string filepath. Received \`${imageFilePath}\`.`,
        hint: "If you want to use an image from your `src` folder, you need to either import it or if the image is coming from a content collection, use the [image() schema helper](https://docs.astro.build/en/guides/images/#images-in-content-collections). See https://docs.astro.build/en/reference/modules/astro-assets/#src-required for more information on the `src` property."
    };
    MissingSharp = {
        name: "MissingSharp",
        title: "Could not find Sharp.",
        message: "Could not find Sharp. Please install Sharp (`sharp`) manually into your project or migrate to another image service.",
        hint: "See Sharp's installation instructions for more information: https://sharp.pixelplumbing.com/install. If you are not relying on `astro:assets` to optimize, transform, or process any images, you can configure a passthrough image service instead of installing Sharp. See https://docs.astro.build/en/reference/errors/missing-sharp for more information.\n\nSee https://docs.astro.build/en/guides/images/#default-image-service for more information on how to migrate to another image service."
    };
    const i18nNoLocaleFoundInPath = {
        name: "i18nNoLocaleFoundInPath",
        title: "The path doesn't contain any locale.",
        message: "You tried to use an i18n utility on a path that doesn't contain any locale. You can use `pathHasLocale` first to determine if the path has a locale."
    };
    const RewriteWithBodyUsed = {
        name: "RewriteWithBodyUsed",
        title: "Cannot use `Astro.rewrite()` after the request body has been read.",
        message: "`Astro.rewrite()` cannot be used if the request body has already been read. If you need to read the body, first clone the request."
    };
    const ForbiddenRewrite = {
        name: "ForbiddenRewrite",
        title: "Forbidden rewrite to a static route.",
        message: (from, to, component)=>`You tried to rewrite the on-demand route '${from}' with the static route '${to}', when using the 'server' output. 

The static route '${to}' is rendered by the component
'${component}', which is marked as prerendered. This is a forbidden operation because during the build, the component '${component}' is compiled to an
HTML file, which can't be retrieved at runtime by Astro.`,
        hint: (component)=>`Add \`export const prerender = false\` to the component '${component}', or use \`Astro.redirect()\`.`
    };
    FontFamilyNotFound = {
        name: "FontFamilyNotFound",
        title: "Font family not found.",
        message: (family)=>`No data was found for the \`"${family}"\` family passed to the \`<Font>\` component.`,
        hint: "This is often caused by a typo. Check that the `<Font />` component is using a `cssVariable` specified in your config."
    };
    MissingGetFontFileRequestUrl = {
        name: "MissingGetFontFileRequestUrl",
        title: "`experimental_getFontFileURL()` requires the request URL with on-demand rendering.",
        hint: "Pass the request URL as the 2nd argument, for example `Astro.url`."
    };
    const UnableToLoadLogger = {
        name: "UnableToLoadLogger",
        title: "Unable to load the logger.",
        message: (path)=>`Couldn't load the logger at given path "${path}".`
    };
    const ActionsReturnedInvalidDataError = {
        name: "ActionsReturnedInvalidDataError",
        title: "Action handler returned invalid data.",
        message: (error)=>`Action handler returned invalid data. Handlers should return serializable data types like objects, arrays, strings, and numbers. Parse error: ${error}`,
        hint: "See the devalue library for all supported types: https://github.com/rich-harris/devalue"
    };
    const ActionNotFoundError = {
        name: "ActionNotFoundError",
        title: "Action not found.",
        message: (actionName)=>`The server received a request for an action named \`${actionName}\` but could not find a match. If you renamed an action, check that you've updated your \`actions/index\` file and your calling code to match.`,
        hint: "You can run `astro check` to detect type errors caused by mismatched action names."
    };
    const SessionStorageInitError = {
        name: "SessionStorageInitError",
        title: "Session storage could not be initialized.",
        message: (error, driver)=>`Error when initializing session storage${driver ? ` with driver \`${driver}\`` : ""}. \`${error ?? ""}\``,
        hint: "For more information, see https://docs.astro.build/en/guides/sessions/"
    };
    const SessionStorageSaveError = {
        name: "SessionStorageSaveError",
        title: "Session data could not be saved.",
        message: (error, driver)=>`Error when saving session data${driver ? ` with driver \`${driver}\`` : ""}. \`${error ?? ""}\``,
        hint: "For more information, see https://docs.astro.build/en/guides/sessions/"
    };
    const CacheNotEnabled = {
        name: "CacheNotEnabled",
        title: "Cache is not enabled.",
        message: "`Astro.cache` is not available because the cache feature is not enabled. To use caching, configure a cache provider in your Astro config under `experimental.cache`.",
        hint: 'Use an adapter that provides a default cache provider, or set one explicitly: `experimental: { cache: { provider: "..." } }`. See https://docs.astro.build/en/reference/experimental-flags/route-caching/.'
    };
    function normalizeLF(code) {
        return code.replace(/\r\n|\r(?!\n)|\n/g, "\n");
    }
    function codeFrame(src, loc) {
        if (!loc || loc.line === void 0 || loc.column === void 0) {
            return "";
        }
        const lines = normalizeLF(src).split("\n").map((ln)=>ln.replace(/\t/g, "  "));
        const visibleLines = [];
        for(let n = -2; n <= 2; n++){
            if (lines[loc.line + n]) visibleLines.push(loc.line + n);
        }
        let gutterWidth = 0;
        for (const lineNo of visibleLines){
            let w = `> ${lineNo}`;
            if (w.length > gutterWidth) gutterWidth = w.length;
        }
        let output = "";
        for (const lineNo of visibleLines){
            const isFocusedLine = lineNo === loc.line - 1;
            output += isFocusedLine ? "> " : "  ";
            output += `${lineNo + 1} | ${lines[lineNo]}
`;
            if (isFocusedLine) output += `${Array.from({
                length: gutterWidth
            }).join(" ")}  | ${Array.from({
                length: loc.column
            }).join(" ")}^
`;
        }
        return output;
    }
    AstroError = class extends Error {
        loc;
        title;
        hint;
        frame;
        type = "AstroError";
        constructor(props, options){
            const { name, title, message, stack, location, hint, frame } = props;
            super(message, options);
            this.title = title;
            this.name = name;
            if (message) this.message = message;
            this.stack = stack ? stack : this.stack;
            this.loc = location;
            this.hint = hint;
            this.frame = frame;
        }
        setLocation(location) {
            this.loc = location;
        }
        setName(name) {
            this.name = name;
        }
        setMessage(message) {
            this.message = message;
        }
        setHint(hint) {
            this.hint = hint;
        }
        setFrame(source, location) {
            this.frame = codeFrame(source, location);
        }
        static is(err) {
            return err?.type === "AstroError";
        }
    };
    async function readBodyWithLimit(request, limit) {
        const contentLengthHeader = request.headers.get("content-length");
        if (contentLengthHeader) {
            const contentLength = Number.parseInt(contentLengthHeader, 10);
            if (Number.isFinite(contentLength) && contentLength > limit) {
                throw new BodySizeLimitError(limit);
            }
        }
        if (!request.body) return new Uint8Array();
        const reader = request.body.getReader();
        const chunks = [];
        let received = 0;
        while(true){
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                received += value.byteLength;
                if (received > limit) {
                    throw new BodySizeLimitError(limit);
                }
                chunks.push(value);
            }
        }
        const buffer = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks){
            buffer.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return buffer;
    }
    class BodySizeLimitError extends Error {
        limit;
        constructor(limit){
            super(`Request body exceeds the configured limit of ${limit} bytes`);
            this.name = "BodySizeLimitError";
            this.limit = limit;
        }
    }
    const __vite_import_meta_env__ = {
        "ASSETS_PREFIX": undefined,
        "BASE_URL": "/",
        "DEV": false,
        "MODE": "production",
        "PROD": true,
        "SITE": undefined,
        "SSR": true
    };
    function getActionContext(context) {
        const callerInfo = getCallerInfo(context);
        const actionResultAlreadySet = Boolean(context.locals._actionPayload);
        let action = void 0;
        if (callerInfo && context.request.method === "POST" && !actionResultAlreadySet) {
            action = {
                calledFrom: callerInfo.from,
                name: callerInfo.name,
                handler: async ()=>{
                    const pipeline = Reflect.get(context, pipelineSymbol);
                    const callerInfoName = shouldAppendForwardSlash(pipeline.manifest.trailingSlash, pipeline.manifest.buildFormat) ? removeTrailingForwardSlash(callerInfo.name) : callerInfo.name;
                    let baseAction;
                    try {
                        baseAction = await pipeline.getAction(callerInfoName);
                    } catch (error) {
                        if (error instanceof Error && "name" in error && typeof error.name === "string" && error.name === ActionNotFoundError.name) {
                            return {
                                data: void 0,
                                error: new ActionError({
                                    code: "NOT_FOUND"
                                })
                            };
                        }
                        throw error;
                    }
                    const bodySizeLimit = pipeline.manifest.actionBodySizeLimit;
                    let input;
                    try {
                        input = await parseRequestBody(context.request, bodySizeLimit);
                    } catch (e) {
                        if (e instanceof ActionError) {
                            return {
                                data: void 0,
                                error: e
                            };
                        }
                        if (e instanceof TypeError) {
                            return {
                                data: void 0,
                                error: new ActionError({
                                    code: "UNSUPPORTED_MEDIA_TYPE"
                                })
                            };
                        }
                        throw e;
                    }
                    const omitKeys = [
                        "props",
                        "getActionResult",
                        "callAction",
                        "redirect"
                    ];
                    const actionAPIContext = Object.create(Object.getPrototypeOf(context), Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(context)).filter(([key])=>!omitKeys.includes(key))));
                    Reflect.set(actionAPIContext, ACTION_API_CONTEXT_SYMBOL, true);
                    const handler = baseAction.bind(actionAPIContext);
                    return handler(input);
                }
            };
        }
        function setActionResult(actionName, actionResult) {
            context.locals._actionPayload = {
                actionResult,
                actionName
            };
        }
        return {
            action,
            setActionResult,
            serializeActionResult,
            deserializeActionResult
        };
    }
    function getCallerInfo(ctx) {
        if (ctx.routePattern === ACTION_RPC_ROUTE_PATTERN) {
            return {
                from: "rpc",
                name: ctx.url.pathname.replace(/^.*\/_actions\//, "")
            };
        }
        const queryParam = ctx.url.searchParams.get(ACTION_QUERY_PARAMS.actionName);
        if (queryParam) {
            return {
                from: "form",
                name: queryParam
            };
        }
        return void 0;
    }
    async function parseRequestBody(request, bodySizeLimit) {
        const contentType = request.headers.get("content-type");
        const contentLengthHeader = request.headers.get("content-length");
        const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : void 0;
        const hasContentLength = typeof contentLength === "number" && Number.isFinite(contentLength);
        if (!contentType) return void 0;
        if (hasContentLength && contentLength > bodySizeLimit) {
            throw new ActionError({
                code: "CONTENT_TOO_LARGE",
                message: `Request body exceeds ${bodySizeLimit} bytes`
            });
        }
        try {
            if (hasContentType(contentType, formContentTypes$1)) {
                if (!hasContentLength) {
                    const body = await readBodyWithLimit(request.clone(), bodySizeLimit);
                    const formRequest = new Request(request.url, {
                        method: request.method,
                        headers: request.headers,
                        body: toArrayBuffer(body)
                    });
                    return await formRequest.formData();
                }
                return await request.clone().formData();
            }
            if (hasContentType(contentType, [
                "application/json"
            ])) {
                if (contentLength === 0) return void 0;
                if (!hasContentLength) {
                    const body = await readBodyWithLimit(request.clone(), bodySizeLimit);
                    if (body.byteLength === 0) return void 0;
                    return JSON.parse(new TextDecoder().decode(body));
                }
                return await request.clone().json();
            }
        } catch (e) {
            if (e instanceof BodySizeLimitError) {
                throw new ActionError({
                    code: "CONTENT_TOO_LARGE",
                    message: `Request body exceeds ${bodySizeLimit} bytes`
                });
            }
            throw e;
        }
        throw new TypeError("Unsupported content type");
    }
    const ACTION_API_CONTEXT_SYMBOL = Symbol.for("astro.actionAPIContext");
    const formContentTypes$1 = [
        "application/x-www-form-urlencoded",
        "multipart/form-data"
    ];
    function hasContentType(contentType, expected) {
        const type = contentType.split(";")[0].toLowerCase();
        return expected.some((t)=>type === t);
    }
    function serializeActionResult(res) {
        if (res.error) {
            if (Object.assign(__vite_import_meta_env__, {
                _: "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/.bin/astro"
            })?.DEV) {
                actionResultErrorStack.set(res.error.stack);
            }
            let body2;
            if (res.error instanceof ActionInputError) {
                body2 = {
                    type: res.error.type,
                    issues: res.error.issues,
                    fields: res.error.fields
                };
            } else {
                body2 = {
                    ...res.error,
                    message: res.error.message
                };
            }
            return {
                type: "error",
                status: res.error.status,
                contentType: "application/json",
                body: JSON.stringify(body2)
            };
        }
        if (res.data === void 0) {
            return {
                type: "empty",
                status: 204
            };
        }
        let body;
        try {
            body = stringify$1(res.data, {
                URL: (value)=>value instanceof URL && value.href
            });
        } catch (e) {
            let hint = ActionsReturnedInvalidDataError.hint;
            if (res.data instanceof Response) {
                hint = REDIRECT_STATUS_CODES.includes(res.data.status) ? "If you need to redirect when the action succeeds, trigger a redirect where the action is called. See the Actions guide for server and client redirect examples: https://docs.astro.build/en/guides/actions." : "If you need to return a Response object, try using a server endpoint instead. See https://docs.astro.build/en/guides/endpoints/#server-endpoints-api-routes";
            }
            throw new AstroError({
                ...ActionsReturnedInvalidDataError,
                message: ActionsReturnedInvalidDataError.message(String(e)),
                hint
            });
        }
        return {
            type: "data",
            status: 200,
            contentType: "application/json+devalue",
            body
        };
    }
    function toArrayBuffer(buffer) {
        const copy = new Uint8Array(buffer.byteLength);
        copy.set(buffer);
        return copy.buffer;
    }
    function hasActionPayload(locals) {
        return "_actionPayload" in locals;
    }
    function createGetActionResult(locals) {
        return (actionFn)=>{
            if (!hasActionPayload(locals) || actionFn.toString() !== getActionQueryString(locals._actionPayload.actionName)) {
                return void 0;
            }
            return deserializeActionResult(locals._actionPayload.actionResult);
        };
    }
    function createCallAction(context) {
        return (baseAction, input)=>{
            Reflect.set(context, ACTION_API_CONTEXT_SYMBOL, true);
            const action = baseAction.bind(context);
            return action(input);
        };
    }
    const DELETED_EXPIRATION = new Date(0);
    const DELETED_VALUE = "deleted";
    const responseSentSymbol = Symbol.for("astro.responseSent");
    const identity = (value)=>value;
    class AstroCookie {
        value;
        constructor(value){
            this.value = value;
        }
        json() {
            if (this.value === void 0) {
                throw new Error(`Cannot convert undefined to an object.`);
            }
            return JSON.parse(this.value);
        }
        number() {
            return Number(this.value);
        }
        boolean() {
            if (this.value === "false") return false;
            if (this.value === "0") return false;
            return Boolean(this.value);
        }
    }
    class AstroCookies {
        #request;
        #requestValues;
        #outgoing;
        #consumed;
        constructor(request){
            this.#request = request;
            this.#requestValues = null;
            this.#outgoing = null;
            this.#consumed = false;
        }
        delete(key, options) {
            const { maxAge: _ignoredMaxAge, expires: _ignoredExpires, ...sanitizedOptions } = options || {};
            const serializeOptions = {
                expires: DELETED_EXPIRATION,
                ...sanitizedOptions
            };
            this.#ensureOutgoingMap().set(key, [
                DELETED_VALUE,
                serialize(key, DELETED_VALUE, serializeOptions),
                false
            ]);
        }
        get(key, options = void 0) {
            if (this.#outgoing?.has(key)) {
                let [serializedValue, , isSetValue] = this.#outgoing.get(key);
                if (isSetValue) {
                    return new AstroCookie(serializedValue);
                } else {
                    return void 0;
                }
            }
            const decode = options?.decode ?? decodeURIComponent;
            const values = this.#ensureParsed();
            if (key in values) {
                const value = values[key];
                if (value) {
                    let decodedValue;
                    try {
                        decodedValue = decode(value);
                    } catch (_error) {
                        decodedValue = value;
                    }
                    return new AstroCookie(decodedValue);
                }
            }
        }
        has(key, _options) {
            if (this.#outgoing?.has(key)) {
                let [, , isSetValue] = this.#outgoing.get(key);
                return isSetValue;
            }
            const values = this.#ensureParsed();
            return values[key] !== void 0;
        }
        set(key, value, options) {
            if (this.#consumed) {
                const warning = new Error("Astro.cookies.set() was called after the cookies had already been sent to the browser.\nThis may have happened if this method was called in an imported component.\nPlease make sure that Astro.cookies.set() is only called in the frontmatter of the main page.");
                warning.name = "Warning";
                console.warn(warning);
            }
            let serializedValue;
            if (typeof value === "string") {
                serializedValue = value;
            } else {
                let toStringValue = value.toString();
                if (toStringValue === Object.prototype.toString.call(value)) {
                    serializedValue = JSON.stringify(value);
                } else {
                    serializedValue = toStringValue;
                }
            }
            const serializeOptions = {};
            if (options) {
                Object.assign(serializeOptions, options);
            }
            this.#ensureOutgoingMap().set(key, [
                serializedValue,
                serialize(key, serializedValue, serializeOptions),
                true
            ]);
            if (this.#request[responseSentSymbol]) {
                throw new AstroError({
                    ...ResponseSentError
                });
            }
        }
        merge(cookies) {
            const outgoing = cookies.#outgoing;
            if (outgoing) {
                for (const [key, value] of outgoing){
                    this.#ensureOutgoingMap().set(key, value);
                }
            }
        }
        *headers() {
            if (this.#outgoing == null) return;
            for (const [, value] of this.#outgoing){
                yield value[1];
            }
        }
        consume() {
            this.#consumed = true;
            return this.headers();
        }
        static consume(cookies) {
            return cookies.consume();
        }
        #ensureParsed() {
            if (!this.#requestValues) {
                this.#parse();
            }
            if (!this.#requestValues) {
                this.#requestValues = Object.create(null);
            }
            return this.#requestValues;
        }
        #ensureOutgoingMap() {
            if (!this.#outgoing) {
                this.#outgoing = new Map();
            }
            return this.#outgoing;
        }
        #parse() {
            const raw = this.#request.headers.get("cookie");
            if (!raw) {
                return;
            }
            this.#requestValues = parse$1(raw, {
                decode: identity
            });
        }
    }
    const astroCookiesSymbol = Symbol.for("astro.cookies");
    function attachCookiesToResponse(response, cookies) {
        Reflect.set(response, astroCookiesSymbol, cookies);
    }
    function getCookiesFromResponse(response) {
        let cookies = Reflect.get(response, astroCookiesSymbol);
        if (cookies != null) {
            return cookies;
        } else {
            return void 0;
        }
    }
    function* getSetCookiesFromResponse(response) {
        const cookies = getCookiesFromResponse(response);
        if (!cookies) {
            return [];
        }
        for (const headerValue of cookies.consume()){
            yield headerValue;
        }
        return [];
    }
    const NOOP_ACTIONS_MOD = {
        server: {}
    };
    function defineMiddleware(fn) {
        return fn;
    }
    const FORM_CONTENT_TYPES = [
        "application/x-www-form-urlencoded",
        "multipart/form-data",
        "text/plain"
    ];
    const SAFE_METHODS = [
        "GET",
        "HEAD",
        "OPTIONS"
    ];
    function createOriginCheckMiddleware() {
        return defineMiddleware((context, next)=>{
            const { request, url, isPrerendered } = context;
            if (isPrerendered) {
                return next();
            }
            if (SAFE_METHODS.includes(request.method)) {
                return next();
            }
            const isSameOrigin = request.headers.get("origin") === url.origin;
            const hasContentType = request.headers.has("content-type");
            if (hasContentType) {
                const formLikeHeader = hasFormLikeHeader(request.headers.get("content-type"));
                if (formLikeHeader && !isSameOrigin) {
                    return new Response(`Cross-site ${request.method} form submissions are forbidden`, {
                        status: 403
                    });
                }
            } else {
                if (!isSameOrigin) {
                    return new Response(`Cross-site ${request.method} form submissions are forbidden`, {
                        status: 403
                    });
                }
            }
            return next();
        });
    }
    function hasFormLikeHeader(contentType) {
        if (contentType) {
            for (const FORM_CONTENT_TYPE of FORM_CONTENT_TYPES){
                if (contentType.toLowerCase().includes(FORM_CONTENT_TYPE)) {
                    return true;
                }
            }
        }
        return false;
    }
    const NOOP_MIDDLEWARE_FN = async (_ctx, next)=>{
        const response = await next();
        response.headers.set(NOOP_MIDDLEWARE_HEADER, "true");
        return response;
    };
    function createRequest({ url, headers, method = "GET", body = void 0, logger, isPrerendered = false, routePattern, init }) {
        const headersObj = isPrerendered ? void 0 : headers instanceof Headers ? headers : new Headers(Object.entries(headers).filter(([name])=>!name.startsWith(":")));
        if (typeof url === "string") url = new URL(url);
        if (isPrerendered) {
            url.search = "";
        }
        const request = new Request(url, {
            method,
            headers: headersObj,
            body: isPrerendered ? null : body,
            ...init
        });
        if (isPrerendered) {
            let _headers = request.headers;
            const { value, writable, ...headersDesc } = Object.getOwnPropertyDescriptor(request, "headers") || {};
            Object.defineProperty(request, "headers", {
                ...headersDesc,
                get () {
                    logger.warn(null, `\`Astro.request.headers\` was used when rendering the route \`${routePattern}'\`. \`Astro.request.headers\` is not available on prerendered pages. If you need access to request headers, make sure that the page is server-rendered using \`export const prerender = false;\` or by setting \`output\` to \`"server"\` in your Astro config to make all your pages server-rendered by default.`);
                    return _headers;
                },
                set (newHeaders) {
                    _headers = newHeaders;
                }
            });
        }
        return request;
    }
    function template({ title, pathname, statusCode = 404, tabTitle, body }) {
        return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8">
		<title>${tabTitle}</title>
		<style>
			:root {
				--gray-10: hsl(258, 7%, 10%);
				--gray-20: hsl(258, 7%, 20%);
				--gray-30: hsl(258, 7%, 30%);
				--gray-40: hsl(258, 7%, 40%);
				--gray-50: hsl(258, 7%, 50%);
				--gray-60: hsl(258, 7%, 60%);
				--gray-70: hsl(258, 7%, 70%);
				--gray-80: hsl(258, 7%, 80%);
				--gray-90: hsl(258, 7%, 90%);
				--black: #13151A;
				--accent-light: #E0CCFA;
			}

			* {
				box-sizing: border-box;
			}

			html {
				background: var(--black);
				color-scheme: dark;
				accent-color: var(--accent-light);
			}

			body {
				background-color: var(--gray-10);
				color: var(--gray-80);
				font-family: ui-monospace, Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", "Roboto Mono", "Oxygen Mono", "Ubuntu Monospace", "Source Code Pro", "Fira Mono", "Droid Sans Mono", "Courier New", monospace;
				line-height: 1.5;
				margin: 0;
			}

			a {
				color: var(--accent-light);
			}

			.center {
				display: flex;
				flex-direction: column;
				justify-content: center;
				align-items: center;
				height: 100vh;
				width: 100vw;
			}

			h1 {
				margin-bottom: 8px;
				color: white;
				font-family: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
				font-weight: 700;
				margin-top: 1rem;
				margin-bottom: 0;
			}

			.statusCode {
				color: var(--accent-light);
			}

			.astro-icon {
				height: 124px;
				width: 124px;
			}

			pre, code {
				padding: 2px 8px;
				background: rgba(0,0,0, 0.25);
				border: 1px solid rgba(255,255,255, 0.25);
				border-radius: 4px;
				font-size: 1.2em;
				margin-top: 0;
				max-width: 60em;
			}
		</style>
	</head>
	<body>
		<main class="center">
			<svg class="astro-icon" xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="0 0 64 80" fill="none"> <path d="M20.5253 67.6322C16.9291 64.3531 15.8793 57.4632 17.3776 52.4717C19.9755 55.6188 23.575 56.6157 27.3035 57.1784C33.0594 58.0468 38.7122 57.722 44.0592 55.0977C44.6709 54.7972 45.2362 54.3978 45.9045 53.9931C46.4062 55.4451 46.5368 56.9109 46.3616 58.4028C45.9355 62.0362 44.1228 64.8429 41.2397 66.9705C40.0868 67.8215 38.8669 68.5822 37.6762 69.3846C34.0181 71.8508 33.0285 74.7426 34.403 78.9491C34.4357 79.0516 34.4649 79.1541 34.5388 79.4042C32.6711 78.5705 31.3069 77.3565 30.2674 75.7604C29.1694 74.0757 28.6471 72.2121 28.6196 70.1957C28.6059 69.2144 28.6059 68.2244 28.4736 67.257C28.1506 64.8985 27.0406 63.8425 24.9496 63.7817C22.8036 63.7192 21.106 65.0426 20.6559 67.1268C20.6215 67.2865 20.5717 67.4446 20.5218 67.6304L20.5253 67.6322Z" fill="white"/> <path d="M20.5253 67.6322C16.9291 64.3531 15.8793 57.4632 17.3776 52.4717C19.9755 55.6188 23.575 56.6157 27.3035 57.1784C33.0594 58.0468 38.7122 57.722 44.0592 55.0977C44.6709 54.7972 45.2362 54.3978 45.9045 53.9931C46.4062 55.4451 46.5368 56.9109 46.3616 58.4028C45.9355 62.0362 44.1228 64.8429 41.2397 66.9705C40.0868 67.8215 38.8669 68.5822 37.6762 69.3846C34.0181 71.8508 33.0285 74.7426 34.403 78.9491C34.4357 79.0516 34.4649 79.1541 34.5388 79.4042C32.6711 78.5705 31.3069 77.3565 30.2674 75.7604C29.1694 74.0757 28.6471 72.2121 28.6196 70.1957C28.6059 69.2144 28.6059 68.2244 28.4736 67.257C28.1506 64.8985 27.0406 63.8425 24.9496 63.7817C22.8036 63.7192 21.106 65.0426 20.6559 67.1268C20.6215 67.2865 20.5717 67.4446 20.5218 67.6304L20.5253 67.6322Z" fill="url(#paint0_linear_738_686)"/> <path d="M0 51.6401C0 51.6401 10.6488 46.4654 21.3274 46.4654L29.3786 21.6102C29.6801 20.4082 30.5602 19.5913 31.5538 19.5913C32.5474 19.5913 33.4275 20.4082 33.7289 21.6102L41.7802 46.4654C54.4274 46.4654 63.1076 51.6401 63.1076 51.6401C63.1076 51.6401 45.0197 2.48776 44.9843 2.38914C44.4652 0.935933 43.5888 0 42.4073 0H20.7022C19.5206 0 18.6796 0.935933 18.1251 2.38914C18.086 2.4859 0 51.6401 0 51.6401Z" fill="white"/> <defs> <linearGradient id="paint0_linear_738_686" x1="31.554" y1="75.4423" x2="39.7462" y2="48.376" gradientUnits="userSpaceOnUse"> <stop stop-color="#D83333"/> <stop offset="1" stop-color="#F041FF"/> </linearGradient> </defs> </svg>
			<h1>${statusCode ? `<span class="statusCode">${statusCode}: </span> ` : ""}<span class="statusMessage">${title}</span></h1>
			${body || `
				<pre>Path: ${escape(pathname)}</pre>
			`}
			</main>
	</body>
</html>`;
    }
    const DEFAULT_404_ROUTE = {
        component: DEFAULT_404_COMPONENT,
        params: [],
        pattern: /^\/404\/?$/,
        prerender: false,
        pathname: "/404",
        segments: [
            [
                {
                    content: "404",
                    dynamic: false,
                    spread: false
                }
            ]
        ],
        type: "page",
        route: "/404",
        fallbackRoutes: [],
        isIndex: false,
        origin: "internal",
        distURL: []
    };
    async function default404Page({ pathname }) {
        return new Response(template({
            statusCode: 404,
            title: "Not found",
            tabTitle: "404: Not Found",
            pathname
        }), {
            status: 404,
            headers: {
                "Content-Type": "text/html"
            }
        });
    }
    default404Page.isAstroComponentFactory = true;
    const default404Instance = {
        default: default404Page
    };
    const ROUTE404_RE = /^\/404\/?$/;
    const ROUTE500_RE = /^\/500\/?$/;
    function isRoute404(route) {
        return ROUTE404_RE.test(route);
    }
    function isRoute500(route) {
        return ROUTE500_RE.test(route);
    }
    function findRouteToRewrite({ payload, routes, request, trailingSlash, buildFormat, base, outDir }) {
        let newUrl = void 0;
        if (payload instanceof URL) {
            newUrl = payload;
        } else if (payload instanceof Request) {
            newUrl = new URL(payload.url);
        } else {
            newUrl = new URL(collapseDuplicateSlashes(payload), new URL(request.url).origin);
        }
        const { pathname, resolvedUrlPathname } = normalizeRewritePathname(newUrl.pathname, base, trailingSlash, buildFormat);
        newUrl.pathname = resolvedUrlPathname;
        const decodedPathname = decodeURI(pathname);
        if (isRoute404(decodedPathname)) {
            const errorRoute = routes.find((route)=>route.route === "/404");
            if (errorRoute) {
                return {
                    routeData: errorRoute,
                    newUrl,
                    pathname: decodedPathname
                };
            }
        }
        if (isRoute500(decodedPathname)) {
            const errorRoute = routes.find((route)=>route.route === "/500");
            if (errorRoute) {
                return {
                    routeData: errorRoute,
                    newUrl,
                    pathname: decodedPathname
                };
            }
        }
        let foundRoute;
        for (const route of routes){
            if (route.pattern.test(decodedPathname)) {
                if (route.params && route.params.length !== 0 && route.distURL && route.distURL.length !== 0) {
                    if (!route.distURL.find((url)=>url.href.replace(outDir.toString(), "").replace(/(?:\/index\.html|\.html)$/, "") === trimSlashes(pathname))) {
                        continue;
                    }
                }
                foundRoute = route;
                break;
            }
        }
        if (foundRoute) {
            return {
                routeData: foundRoute,
                newUrl,
                pathname: decodedPathname
            };
        } else {
            const custom404 = routes.find((route)=>route.route === "/404");
            if (custom404) {
                return {
                    routeData: custom404,
                    newUrl,
                    pathname
                };
            } else {
                return {
                    routeData: DEFAULT_404_ROUTE,
                    newUrl,
                    pathname
                };
            }
        }
    }
    function copyRequest(newUrl, oldRequest, isPrerendered, logger, routePattern) {
        if (oldRequest.bodyUsed) {
            throw new AstroError(RewriteWithBodyUsed);
        }
        return createRequest({
            url: newUrl,
            method: oldRequest.method,
            body: oldRequest.body,
            isPrerendered,
            logger,
            headers: isPrerendered ? {} : oldRequest.headers,
            routePattern,
            init: {
                referrer: oldRequest.referrer,
                referrerPolicy: oldRequest.referrerPolicy,
                mode: oldRequest.mode,
                credentials: oldRequest.credentials,
                cache: oldRequest.cache,
                redirect: oldRequest.redirect,
                integrity: oldRequest.integrity,
                signal: oldRequest.signal,
                keepalive: oldRequest.keepalive,
                duplex: "half"
            }
        });
    }
    function setOriginPathname(request, pathname, trailingSlash, buildFormat) {
        if (!pathname) {
            pathname = "/";
        }
        const shouldAppendSlash = shouldAppendForwardSlash(trailingSlash, buildFormat);
        let finalPathname;
        if (pathname === "/") {
            finalPathname = "/";
        } else if (shouldAppendSlash) {
            finalPathname = appendForwardSlash(pathname);
        } else {
            finalPathname = removeTrailingForwardSlash(pathname);
        }
        Reflect.set(request, originPathnameSymbol, encodeURIComponent(finalPathname));
    }
    function getOriginPathname(request) {
        const origin = Reflect.get(request, originPathnameSymbol);
        if (origin) {
            return decodeURIComponent(origin);
        }
        return new URL(request.url).pathname;
    }
    function normalizeRewritePathname(urlPathname, base, trailingSlash, buildFormat) {
        let pathname = collapseDuplicateSlashes(urlPathname);
        const shouldAppendSlash = shouldAppendForwardSlash(trailingSlash, buildFormat);
        if (base !== "/") {
            const isBasePathRequest = urlPathname === base || urlPathname === removeTrailingForwardSlash(base);
            if (isBasePathRequest) {
                pathname = "/";
            } else if (urlPathname.startsWith(base)) {
                pathname = shouldAppendSlash ? appendForwardSlash(urlPathname) : removeTrailingForwardSlash(urlPathname);
                pathname = pathname.slice(base.length);
            }
        }
        if (!pathname.startsWith("/") && shouldAppendSlash && urlPathname.endsWith("/")) {
            pathname = prependForwardSlash$1(pathname);
        }
        if (buildFormat === "file") {
            pathname = pathname.replace(/\.html$/, "");
        }
        let resolvedUrlPathname;
        if (base !== "/" && (pathname === "" || pathname === "/") && !shouldAppendSlash) {
            resolvedUrlPathname = removeTrailingForwardSlash(base);
        } else {
            resolvedUrlPathname = joinPaths(...[
                base,
                pathname
            ].filter(Boolean));
        }
        return {
            pathname,
            resolvedUrlPathname
        };
    }
    function sequence(...handlers) {
        const filtered = handlers.filter((h)=>!!h);
        const length = filtered.length;
        if (!length) {
            return defineMiddleware((_context, next)=>{
                return next();
            });
        }
        return defineMiddleware((context, next)=>{
            let carriedPayload = void 0;
            return applyHandle(0, context);
            function applyHandle(i, handleContext) {
                const handle = filtered[i];
                const result = handle(handleContext, async (payload)=>{
                    if (i < length - 1) {
                        if (payload) {
                            let newRequest;
                            if (payload instanceof Request) {
                                newRequest = payload;
                            } else if (payload instanceof URL) {
                                newRequest = new Request(payload, handleContext.request.clone());
                            } else {
                                newRequest = new Request(new URL(payload, handleContext.url.origin), handleContext.request.clone());
                            }
                            const oldPathname = handleContext.url.pathname;
                            const pipeline = Reflect.get(handleContext, pipelineSymbol);
                            const { routeData, pathname } = await pipeline.tryRewrite(payload, handleContext.request);
                            if (pipeline.manifest.serverLike === true && handleContext.isPrerendered === false && routeData.prerender === true) {
                                throw new AstroError({
                                    ...ForbiddenRewrite,
                                    message: ForbiddenRewrite.message(handleContext.url.pathname, pathname, routeData.component),
                                    hint: ForbiddenRewrite.hint(routeData.component)
                                });
                            }
                            carriedPayload = payload;
                            handleContext.request = newRequest;
                            handleContext.url = new URL(newRequest.url);
                            handleContext.params = getParams(routeData, pathname);
                            handleContext.routePattern = routeData.route;
                            setOriginPathname(handleContext.request, oldPathname, pipeline.manifest.trailingSlash, pipeline.manifest.buildFormat);
                        }
                        return applyHandle(i + 1, handleContext);
                    } else {
                        return next(payload ?? carriedPayload);
                    }
                });
                return result;
            }
        });
    }
    const RedirectComponentInstance = {
        default () {
            return new Response(null, {
                status: 301
            });
        }
    };
    const RedirectSinglePageBuiltModule = {
        page: ()=>Promise.resolve(RedirectComponentInstance),
        onRequest: (_, next)=>next()
    };
    function sanitizeParams(params) {
        return Object.fromEntries(Object.entries(params).map(([key, value])=>{
            if (typeof value === "string") {
                return [
                    key,
                    value.normalize().replace(/#/g, "%23").replace(/\?/g, "%3F")
                ];
            }
            return [
                key,
                value
            ];
        }));
    }
    function getParameter(part, params) {
        if (part.spread) {
            return params[part.content.slice(3)] || "";
        }
        if (part.dynamic) {
            if (!params[part.content]) {
                throw new TypeError(`Missing parameter: ${part.content}`);
            }
            return params[part.content];
        }
        return part.content.normalize().replace(/\?/g, "%3F").replace(/#/g, "%23").replace(/%5B/g, "[").replace(/%5D/g, "]");
    }
    function getSegment(segment, params) {
        const segmentPath = segment.map((part)=>getParameter(part, params)).join("");
        return segmentPath ? collapseDuplicateLeadingSlashes("/" + segmentPath) : "";
    }
    function getRouteGenerator(segments, addTrailingSlash) {
        return (params)=>{
            const sanitizedParams = sanitizeParams(params);
            let trailing = "";
            if (addTrailingSlash === "always" && segments.length) {
                trailing = "/";
            }
            const path = segments.map((segment)=>getSegment(segment, sanitizedParams)).join("") + trailing;
            return path || "/";
        };
    }
    const VALID_PARAM_TYPES = [
        "string",
        "undefined"
    ];
    function validateGetStaticPathsParameter([key, value], route) {
        if (!VALID_PARAM_TYPES.includes(typeof value)) {
            throw new AstroError({
                ...GetStaticPathsInvalidRouteParam,
                message: GetStaticPathsInvalidRouteParam.message(key, value, typeof value),
                location: {
                    file: route
                }
            });
        }
    }
    function stringifyParams(params, route, trailingSlash) {
        const validatedParams = {};
        for (const [key, value] of Object.entries(params)){
            validateGetStaticPathsParameter([
                key,
                value
            ], route.component);
            if (value !== void 0) {
                validatedParams[key] = trimSlashes(value);
            }
        }
        return getRouteGenerator(route.segments, trailingSlash)(validatedParams);
    }
    function validateDynamicRouteModule(mod, { ssr, route }) {
        if ((!ssr || route.prerender) && route.origin !== "internal" && !mod.getStaticPaths) {
            throw new AstroError({
                ...GetStaticPathsRequired,
                location: {
                    file: route.component
                }
            });
        }
    }
    function validateGetStaticPathsResult(result, route) {
        if (!Array.isArray(result)) {
            throw new AstroError({
                ...InvalidGetStaticPathsReturn,
                message: InvalidGetStaticPathsReturn.message(typeof result),
                location: {
                    file: route.component
                }
            });
        }
        result.forEach((pathObject)=>{
            if (typeof pathObject === "object" && Array.isArray(pathObject) || pathObject === null) {
                throw new AstroError({
                    ...InvalidGetStaticPathsEntry,
                    message: InvalidGetStaticPathsEntry.message(Array.isArray(pathObject) ? "array" : typeof pathObject)
                });
            }
            if (pathObject.params === void 0 || pathObject.params === null || pathObject.params && Object.keys(pathObject.params).length === 0) {
                throw new AstroError({
                    ...GetStaticPathsExpectedParams,
                    location: {
                        file: route.component
                    }
                });
            }
        });
    }
    function generatePaginateFunction(routeMatch, base, trailingSlash) {
        return function paginateUtility(data, args = {}) {
            const generate = getRouteGenerator(routeMatch.segments, trailingSlash);
            let { pageSize: _pageSize, params: _params, props: _props } = args;
            const pageSize = _pageSize || 10;
            const paramName = "page";
            const additionalParams = _params || {};
            const additionalProps = _props || {};
            let includesFirstPageNumber;
            if (routeMatch.params.includes(`...${paramName}`)) {
                includesFirstPageNumber = false;
            } else if (routeMatch.params.includes(`${paramName}`)) {
                includesFirstPageNumber = true;
            } else {
                throw new AstroError({
                    ...PageNumberParamNotFound,
                    message: PageNumberParamNotFound.message(paramName)
                });
            }
            const lastPage = Math.max(1, Math.ceil(data.length / pageSize));
            const result = [
                ...Array(lastPage).keys()
            ].map((num)=>{
                const pageNum = num + 1;
                const start = pageSize === Number.POSITIVE_INFINITY ? 0 : (pageNum - 1) * pageSize;
                const end = Math.min(start + pageSize, data.length);
                const params = {
                    ...additionalParams,
                    [paramName]: includesFirstPageNumber || pageNum > 1 ? String(pageNum) : void 0
                };
                const current = addRouteBase(generate({
                    ...params
                }), base);
                const next = pageNum === lastPage ? void 0 : addRouteBase(generate({
                    ...params,
                    page: String(pageNum + 1)
                }), base);
                const prev = pageNum === 1 ? void 0 : addRouteBase(generate({
                    ...params,
                    page: !includesFirstPageNumber && pageNum - 1 === 1 ? void 0 : String(pageNum - 1)
                }), base);
                const first = pageNum === 1 ? void 0 : addRouteBase(generate({
                    ...params,
                    page: includesFirstPageNumber ? "1" : void 0
                }), base);
                const last = pageNum === lastPage ? void 0 : addRouteBase(generate({
                    ...params,
                    page: String(lastPage)
                }), base);
                return {
                    params,
                    props: {
                        ...additionalProps,
                        page: {
                            data: data.slice(start, end),
                            start,
                            end: end - 1,
                            size: pageSize,
                            total: data.length,
                            currentPage: pageNum,
                            lastPage,
                            url: {
                                current,
                                next,
                                prev,
                                first,
                                last
                            }
                        }
                    }
                };
            });
            return result;
        };
    }
    function addRouteBase(route, base) {
        let routeWithBase = joinPaths(base, route);
        if (routeWithBase === "") routeWithBase = "/";
        return routeWithBase;
    }
    async function callGetStaticPaths({ mod, route, routeCache, ssr, base, trailingSlash }) {
        const cached = routeCache.get(route);
        if (!mod) {
            throw new Error("This is an error caused by Astro and not your code. Please file an issue.");
        }
        if (cached?.staticPaths && cached.mod === mod) {
            return cached.staticPaths;
        }
        validateDynamicRouteModule(mod, {
            ssr,
            route
        });
        if (ssr && !route.prerender || route.origin === "internal") {
            const entry = Object.assign([], {
                keyed: new Map()
            });
            routeCache.set(route, {
                ...cached,
                mod,
                staticPaths: entry
            });
            return entry;
        }
        let staticPaths = [];
        if (!mod.getStaticPaths) {
            throw new Error("Unexpected Error.");
        }
        staticPaths = await mod.getStaticPaths({
            paginate: generatePaginateFunction(route, base, trailingSlash),
            routePattern: route.route
        });
        validateGetStaticPathsResult(staticPaths, route);
        const keyedStaticPaths = staticPaths;
        keyedStaticPaths.keyed = new Map();
        for (const sp of keyedStaticPaths){
            const paramsKey = stringifyParams(sp.params, route, trailingSlash);
            keyedStaticPaths.keyed.set(paramsKey, sp);
        }
        routeCache.set(route, {
            ...cached,
            mod,
            staticPaths: keyedStaticPaths
        });
        return keyedStaticPaths;
    }
    class RouteCache {
        logger;
        cache = {};
        runtimeMode;
        constructor(logger, runtimeMode = "production"){
            this.logger = logger;
            this.runtimeMode = runtimeMode;
        }
        clearAll() {
            this.cache = {};
        }
        set(route, entry) {
            const key = this.key(route);
            if (this.runtimeMode === "production" && this.cache[key]?.staticPaths) {
                this.logger.warn(null, `Internal Warning: route cache overwritten. (${key})`);
            }
            this.cache[key] = entry;
        }
        get(route) {
            return this.cache[this.key(route)];
        }
        key(route) {
            return `${route.route}_${route.component}`;
        }
    }
    function findPathItemByKey(staticPaths, params, route, logger, trailingSlash) {
        const paramsKey = stringifyParams(params, route, trailingSlash);
        const matchedStaticPath = staticPaths.keyed.get(paramsKey);
        if (matchedStaticPath) {
            return matchedStaticPath;
        }
        logger.debug("router", `findPathItemByKey() - Unexpected cache miss looking for ${paramsKey}`);
    }
    async function renderEndpoint(mod, context, isPrerendered, logger) {
        const { request, url } = context;
        const method = request.method.toUpperCase();
        let handler = mod[method] ?? mod["ALL"];
        if (!handler && method === "HEAD" && mod["GET"]) {
            handler = mod["GET"];
        }
        if (isPrerendered && ![
            "GET",
            "HEAD"
        ].includes(method)) {
            logger.warn("router", `${url.pathname} ${colors.bold(method)} requests are not available in static endpoints. Mark this page as server-rendered (\`export const prerender = false;\`) or update your config to \`output: 'server'\` to make all your pages server-rendered by default.`);
        }
        if (handler === void 0) {
            logger.warn("router", `No API Route handler exists for the method "${method}" for the route "${url.pathname}".
Found handlers: ${Object.keys(mod).map((exp)=>JSON.stringify(exp)).join(", ")}
` + ("all" in mod ? `One of the exported handlers is "all" (lowercase), did you mean to export 'ALL'?
` : ""));
            return new Response(null, {
                status: 404
            });
        }
        if (typeof handler !== "function") {
            logger.error("router", `The route "${url.pathname}" exports a value for the method "${method}", but it is of the type ${typeof handler} instead of a function.`);
            return new Response(null, {
                status: 500
            });
        }
        let response = await handler.call(mod, context);
        if (!response || response instanceof Response === false) {
            throw new AstroError(EndpointDidNotReturnAResponse);
        }
        if (REROUTABLE_STATUS_CODES.includes(response.status)) {
            try {
                response.headers.set(REROUTE_DIRECTIVE_HEADER, "no");
            } catch (err) {
                if (err.message?.includes("immutable")) {
                    response = new Response(response.body, response);
                    response.headers.set(REROUTE_DIRECTIVE_HEADER, "no");
                } else {
                    throw err;
                }
            }
        }
        if (method === "HEAD") {
            return new Response(null, response);
        }
        return response;
    }
    function isPromise(value) {
        return !!value && typeof value === "object" && "then" in value && typeof value.then === "function";
    }
    async function* streamAsyncIterator(stream) {
        const reader = stream.getReader();
        try {
            while(true){
                const { done, value } = await reader.read();
                if (done) return;
                yield value;
            }
        } finally{
            reader.releaseLock();
        }
    }
    const escapeHTML = escape;
    function stringifyForScript(value) {
        return JSON.stringify(value)?.replace(/</g, "\\u003c");
    }
    class HTMLBytes extends Uint8Array {
    }
    Object.defineProperty(HTMLBytes.prototype, Symbol.toStringTag, {
        get () {
            return "HTMLBytes";
        }
    });
    const htmlStringSymbol = Symbol.for("astro:html-string");
    class HTMLString extends String {
        [htmlStringSymbol] = true;
    }
    const markHTMLString = (value)=>{
        if (isHTMLString(value)) {
            return value;
        }
        if (typeof value === "string") {
            return new HTMLString(value);
        }
        return value;
    };
    function isHTMLString(value) {
        return !!value?.[htmlStringSymbol];
    }
    function markHTMLBytes(bytes) {
        return new HTMLBytes(bytes);
    }
    function hasGetReader(obj) {
        return typeof obj.getReader === "function";
    }
    async function* unescapeChunksAsync(iterable) {
        if (hasGetReader(iterable)) {
            for await (const chunk of streamAsyncIterator(iterable)){
                yield unescapeHTML(chunk);
            }
        } else {
            for await (const chunk of iterable){
                yield unescapeHTML(chunk);
            }
        }
    }
    function* unescapeChunks(iterable) {
        for (const chunk of iterable){
            yield unescapeHTML(chunk);
        }
    }
    unescapeHTML = function(str) {
        if (!!str && typeof str === "object") {
            if (str instanceof Uint8Array) {
                return markHTMLBytes(str);
            } else if (str instanceof Response && str.body) {
                const body = str.body;
                return unescapeChunksAsync(body);
            } else if (typeof str.then === "function") {
                return Promise.resolve(str).then((value)=>{
                    return unescapeHTML(value);
                });
            } else if (str[Symbol.for("astro:slot-string")]) {
                return str;
            } else if (Symbol.iterator in str) {
                return unescapeChunks(str);
            } else if (Symbol.asyncIterator in str || hasGetReader(str)) {
                return unescapeChunksAsync(str);
            }
        }
        return markHTMLString(str);
    };
    const AstroJSX = "astro:jsx";
    function isVNode(vnode) {
        return vnode && typeof vnode === "object" && vnode[AstroJSX];
    }
    function resolvePropagationHint(input) {
        const explicitHint = input.factoryHint ?? "none";
        if (explicitHint !== "none") {
            return explicitHint;
        }
        if (!input.moduleId) {
            return "none";
        }
        return input.metadataLookup(input.moduleId) ?? "none";
    }
    function isPropagatingHint(hint) {
        return hint === "self" || hint === "in-tree";
    }
    function getPropagationHint$1(result, factory) {
        return resolvePropagationHint({
            factoryHint: factory.propagation,
            moduleId: factory.moduleId,
            metadataLookup: (moduleId)=>result.componentMetadata.get(moduleId)?.propagation
        });
    }
    function isAstroComponentFactory(obj) {
        return obj == null ? false : obj.isAstroComponentFactory === true;
    }
    function isAPropagatingComponent(result, factory) {
        return isPropagatingHint(getPropagationHint(result, factory));
    }
    function getPropagationHint(result, factory) {
        return getPropagationHint$1(result, factory);
    }
    const PROP_TYPE = {
        Value: 0,
        JSON: 1,
        RegExp: 2,
        Date: 3,
        Map: 4,
        Set: 5,
        BigInt: 6,
        URL: 7,
        Uint8Array: 8,
        Uint16Array: 9,
        Uint32Array: 10,
        Infinity: 11
    };
    function serializeArray(value, metadata = {}, parents = new WeakSet()) {
        if (parents.has(value)) {
            throw new Error(`Cyclic reference detected while serializing props for <${metadata.displayName} client:${metadata.hydrate}>!

Cyclic references cannot be safely serialized for client-side usage. Please remove the cyclic reference.`);
        }
        parents.add(value);
        const serialized = value.map((v)=>{
            return convertToSerializedForm(v, metadata, parents);
        });
        parents.delete(value);
        return serialized;
    }
    function serializeObject(value, metadata = {}, parents = new WeakSet()) {
        if (parents.has(value)) {
            throw new Error(`Cyclic reference detected while serializing props for <${metadata.displayName} client:${metadata.hydrate}>!

Cyclic references cannot be safely serialized for client-side usage. Please remove the cyclic reference.`);
        }
        parents.add(value);
        const serialized = Object.fromEntries(Object.entries(value).map(([k, v])=>{
            return [
                k,
                convertToSerializedForm(v, metadata, parents)
            ];
        }));
        parents.delete(value);
        return serialized;
    }
    function convertToSerializedForm(value, metadata = {}, parents = new WeakSet()) {
        const tag = Object.prototype.toString.call(value);
        switch(tag){
            case "[object Date]":
                {
                    return [
                        PROP_TYPE.Date,
                        value.toISOString()
                    ];
                }
            case "[object RegExp]":
                {
                    return [
                        PROP_TYPE.RegExp,
                        value.source
                    ];
                }
            case "[object Map]":
                {
                    return [
                        PROP_TYPE.Map,
                        serializeArray(Array.from(value), metadata, parents)
                    ];
                }
            case "[object Set]":
                {
                    return [
                        PROP_TYPE.Set,
                        serializeArray(Array.from(value), metadata, parents)
                    ];
                }
            case "[object BigInt]":
                {
                    return [
                        PROP_TYPE.BigInt,
                        value.toString()
                    ];
                }
            case "[object URL]":
                {
                    return [
                        PROP_TYPE.URL,
                        value.toString()
                    ];
                }
            case "[object Array]":
                {
                    return [
                        PROP_TYPE.JSON,
                        serializeArray(value, metadata, parents)
                    ];
                }
            case "[object Uint8Array]":
                {
                    return [
                        PROP_TYPE.Uint8Array,
                        Array.from(value)
                    ];
                }
            case "[object Uint16Array]":
                {
                    return [
                        PROP_TYPE.Uint16Array,
                        Array.from(value)
                    ];
                }
            case "[object Uint32Array]":
                {
                    return [
                        PROP_TYPE.Uint32Array,
                        Array.from(value)
                    ];
                }
            default:
                {
                    if (value !== null && typeof value === "object") {
                        return [
                            PROP_TYPE.Value,
                            serializeObject(value, metadata, parents)
                        ];
                    }
                    if (value === Number.POSITIVE_INFINITY) {
                        return [
                            PROP_TYPE.Infinity,
                            1
                        ];
                    }
                    if (value === Number.NEGATIVE_INFINITY) {
                        return [
                            PROP_TYPE.Infinity,
                            -1
                        ];
                    }
                    if (value === void 0) {
                        return [
                            PROP_TYPE.Value
                        ];
                    }
                    return [
                        PROP_TYPE.Value,
                        value
                    ];
                }
        }
    }
    function serializeProps(props, metadata) {
        const serialized = JSON.stringify(serializeObject(props, metadata));
        return serialized;
    }
    const transitionDirectivesToCopyOnIsland = Object.freeze([
        "data-astro-transition-scope",
        "data-astro-transition-persist",
        "data-astro-transition-persist-props"
    ]);
    function extractDirectives(inputProps, clientDirectives) {
        let extracted = {
            isPage: false,
            hydration: null,
            props: {},
            propsWithoutTransitionAttributes: {}
        };
        for (const [key, value] of Object.entries(inputProps)){
            if (key.startsWith("server:")) {
                if (key === "server:root") {
                    extracted.isPage = true;
                }
            }
            if (key.startsWith("client:")) {
                if (!extracted.hydration) {
                    extracted.hydration = {
                        directive: "",
                        value: "",
                        componentUrl: "",
                        componentExport: {
                            value: ""
                        }
                    };
                }
                switch(key){
                    case "client:component-path":
                        {
                            extracted.hydration.componentUrl = value;
                            break;
                        }
                    case "client:component-export":
                        {
                            extracted.hydration.componentExport.value = value;
                            break;
                        }
                    case "client:component-hydration":
                        {
                            break;
                        }
                    case "client:display-name":
                        {
                            break;
                        }
                    default:
                        {
                            extracted.hydration.directive = key.split(":")[1];
                            extracted.hydration.value = value;
                            if (!clientDirectives.has(extracted.hydration.directive)) {
                                const hydrationMethods = Array.from(clientDirectives.keys()).map((d)=>`client:${d}`).join(", ");
                                throw new Error(`Error: invalid hydration directive "${key}". Supported hydration methods: ${hydrationMethods}`);
                            }
                            if (extracted.hydration.directive === "media" && typeof extracted.hydration.value !== "string") {
                                throw new AstroError(MissingMediaQueryDirective);
                            }
                            break;
                        }
                }
            } else {
                extracted.props[key] = value;
                if (!transitionDirectivesToCopyOnIsland.includes(key)) {
                    extracted.propsWithoutTransitionAttributes[key] = value;
                }
            }
        }
        for (const sym of Object.getOwnPropertySymbols(inputProps)){
            extracted.props[sym] = inputProps[sym];
            extracted.propsWithoutTransitionAttributes[sym] = inputProps[sym];
        }
        return extracted;
    }
    async function generateHydrateScript(scriptOptions, metadata) {
        const { renderer, result, astroId, props, attrs } = scriptOptions;
        const { hydrate, componentUrl, componentExport } = metadata;
        if (!componentExport.value) {
            throw new AstroError({
                ...NoMatchingImport,
                message: NoMatchingImport.message(metadata.displayName)
            });
        }
        const island = {
            children: "",
            props: {
                uid: astroId
            }
        };
        if (attrs) {
            for (const [key, value] of Object.entries(attrs)){
                island.props[key] = escapeHTML(value);
            }
        }
        island.props["component-url"] = await result.resolve(decodeURI(componentUrl));
        if (renderer.clientEntrypoint) {
            island.props["component-export"] = componentExport.value;
            island.props["renderer-url"] = await result.resolve(decodeURI(renderer.clientEntrypoint.toString()));
            island.props["props"] = escapeHTML(serializeProps(props, metadata));
        }
        island.props["ssr"] = "";
        island.props["client"] = hydrate;
        let beforeHydrationUrl = await result.resolve("astro:scripts/before-hydration.js");
        if (beforeHydrationUrl.length) {
            island.props["before-hydration-url"] = beforeHydrationUrl;
        }
        island.props["opts"] = escapeHTML(JSON.stringify({
            name: metadata.displayName,
            value: metadata.hydrateArgs || ""
        }));
        transitionDirectivesToCopyOnIsland.forEach((name)=>{
            if (typeof props[name] !== "undefined") {
                island.props[name] = props[name];
            }
        });
        return island;
    }
    const dictionary = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY";
    const binary = dictionary.length;
    function bitwise(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for(let i = 0; i < str.length; i++){
            const ch = str.charCodeAt(i);
            hash = (hash << 5) - hash + ch;
            hash = hash & hash;
        }
        return hash;
    }
    function shorthash(text) {
        let num;
        let result = "";
        let integer = bitwise(text);
        const sign = integer < 0 ? "Z" : "";
        integer = Math.abs(integer);
        while(integer >= binary){
            num = integer % binary;
            integer = Math.floor(integer / binary);
            result = dictionary[num] + result;
        }
        if (integer > 0) {
            result = dictionary[integer] + result;
        }
        return sign + result;
    }
    const headAndContentSym = Symbol.for("astro.headAndContent");
    function isHeadAndContent(obj) {
        return typeof obj === "object" && obj !== null && !!obj[headAndContentSym];
    }
    function createThinHead() {
        return {
            [headAndContentSym]: true
        };
    }
    var astro_island_prebuilt_default = `(()=>{var g=Object.defineProperty;var w=(c,s,d)=>s in c?g(c,s,{enumerable:!0,configurable:!0,writable:!0,value:d}):c[s]=d;var l=(c,s,d)=>w(c,typeof s!="symbol"?s+"":s,d);var E=new Set(["__proto__","constructor","prototype"]);{let c={0:t=>y(t),1:t=>d(t),2:t=>new RegExp(t),3:t=>new Date(t),4:t=>new Map(d(t)),5:t=>new Set(d(t)),6:t=>BigInt(t),7:t=>new URL(t),8:t=>new Uint8Array(t),9:t=>new Uint16Array(t),10:t=>new Uint32Array(t),11:t=>Number.POSITIVE_INFINITY*t},s=t=>{let[p,e]=t;return p in c?c[p](e):void 0},d=t=>t.map(s),y=t=>typeof t!="object"||t===null?t:Object.fromEntries(Object.entries(t).map(([p,e])=>[p,s(e)]));class f extends HTMLElement{constructor(){super(...arguments);l(this,"Component");l(this,"hydrator");l(this,"hydrate",async()=>{var b;if(!this.hydrator||!this.isConnected)return;let e=(b=this.parentElement)==null?void 0:b.closest("astro-island[ssr]");if(e){e.addEventListener("astro:hydrate",this.hydrate,{once:!0});return}let n=this.querySelectorAll("astro-slot"),r={},i=this.querySelectorAll("template[data-astro-template]");for(let o of i){let a=o.closest(this.tagName);a!=null&&a.isSameNode(this)&&(r[o.getAttribute("data-astro-template")||"default"]=o.innerHTML,o.remove())}for(let o of n){let a=o.closest(this.tagName);a!=null&&a.isSameNode(this)&&(r[o.getAttribute("name")||"default"]=o.innerHTML)}let u;try{u=this.hasAttribute("props")?y(JSON.parse(this.getAttribute("props"))):{}}catch(o){let a=this.getAttribute("component-url")||"<unknown>",v=this.getAttribute("component-export");throw v&&(a+=\` (export \${v})\`),console.error(\`[hydrate] Error parsing props for component \${a}\`,this.getAttribute("props"),o),o}let h;await this.hydrator(this)(this.Component,u,r,{client:this.getAttribute("client")}),this.removeAttribute("ssr"),this.dispatchEvent(new CustomEvent("astro:hydrate"))});l(this,"unmount",()=>{this.isConnected||this.dispatchEvent(new CustomEvent("astro:unmount"))})}disconnectedCallback(){document.removeEventListener("astro:after-swap",this.unmount),document.addEventListener("astro:after-swap",this.unmount,{once:!0})}connectedCallback(){if(!this.hasAttribute("await-children")||document.readyState==="interactive"||document.readyState==="complete")this.childrenConnectedCallback();else{let e=()=>{document.removeEventListener("DOMContentLoaded",e),n.disconnect(),this.childrenConnectedCallback()},n=new MutationObserver(()=>{var r;((r=this.lastChild)==null?void 0:r.nodeType)===Node.COMMENT_NODE&&this.lastChild.nodeValue==="astro:end"&&(this.lastChild.remove(),e())});n.observe(this,{childList:!0}),document.addEventListener("DOMContentLoaded",e)}}async childrenConnectedCallback(){let e=this.getAttribute("before-hydration-url");e&&await import(e),this.start()}getRetryImportUrl(e){let n=new URL(e,document.baseURI),r=\`astro-retry=\${Date.now()}\`,i=n.hash.replace(/^#/,"");return n.hash=i?\`\${i}&\${r}\`:r,n.toString()}async importWithRetry(e){try{return await import(e)}catch(n){return await new Promise(r=>setTimeout(r,1e3)),import(this.getRetryImportUrl(e))}}handleHydrationError(e){let n=this.getAttribute("component-url"),r=new CustomEvent("astro:hydration-error",{cancelable:!0,bubbles:!0,composed:!0,detail:{error:e,componentUrl:n}});this.dispatchEvent(r)&&console.error(\`[astro-island] Error hydrating \${n}\`,e)}async start(){let e=JSON.parse(this.getAttribute("opts")),n=this.getAttribute("client");if(Astro[n]===void 0){window.addEventListener(\`astro:\${n}\`,()=>this.start(),{once:!0});return}try{await Astro[n](async()=>{let r=this.getAttribute("renderer-url");try{let[i,{default:u}]=await Promise.all([this.importWithRetry(this.getAttribute("component-url")),r?this.importWithRetry(r):Promise.resolve({default:()=>()=>{}})]),h=this.getAttribute("component-export")||"default";if(h.includes(".")){this.Component=i;for(let m of h.split(".")){if(E.has(m)||!this.Component||typeof this.Component!="object"&&typeof this.Component!="function"||!Object.hasOwn(this.Component,m))throw new Error(\`Invalid component export path: \${h}\`);this.Component=this.Component[m]}}else{if(E.has(h))throw new Error(\`Invalid component export path: \${h}\`);this.Component=i[h]}return this.hydrator=u,this.hydrate}catch(i){return this.handleHydrationError(i),()=>{}}},e,this)}catch(r){this.handleHydrationError(r)}}attributeChangedCallback(){this.hydrate()}}l(f,"observedAttributes",["props"]),customElements.get("astro-island")||customElements.define("astro-island",f)}})();`;
    var astro_island_prebuilt_dev_default = `(()=>{var g=Object.defineProperty;var w=(d,s,h)=>s in d?g(d,s,{enumerable:!0,configurable:!0,writable:!0,value:h}):d[s]=h;var l=(d,s,h)=>w(d,typeof s!="symbol"?s+"":s,h);var E=new Set(["__proto__","constructor","prototype"]);{let d={0:t=>y(t),1:t=>h(t),2:t=>new RegExp(t),3:t=>new Date(t),4:t=>new Map(h(t)),5:t=>new Set(h(t)),6:t=>BigInt(t),7:t=>new URL(t),8:t=>new Uint8Array(t),9:t=>new Uint16Array(t),10:t=>new Uint32Array(t),11:t=>Number.POSITIVE_INFINITY*t},s=t=>{let[p,e]=t;return p in d?d[p](e):void 0},h=t=>t.map(s),y=t=>typeof t!="object"||t===null?t:Object.fromEntries(Object.entries(t).map(([p,e])=>[p,s(e)]));class f extends HTMLElement{constructor(){super(...arguments);l(this,"Component");l(this,"hydrator");l(this,"hydrate",async()=>{var b;if(!this.hydrator||!this.isConnected)return;let e=(b=this.parentElement)==null?void 0:b.closest("astro-island[ssr]");if(e){e.addEventListener("astro:hydrate",this.hydrate,{once:!0});return}let n=this.querySelectorAll("astro-slot"),r={},i=this.querySelectorAll("template[data-astro-template]");for(let o of i){let c=o.closest(this.tagName);c!=null&&c.isSameNode(this)&&(r[o.getAttribute("data-astro-template")||"default"]=o.innerHTML,o.remove())}for(let o of n){let c=o.closest(this.tagName);c!=null&&c.isSameNode(this)&&(r[o.getAttribute("name")||"default"]=o.innerHTML)}let m;try{m=this.hasAttribute("props")?y(JSON.parse(this.getAttribute("props"))):{}}catch(o){let c=this.getAttribute("component-url")||"<unknown>",v=this.getAttribute("component-export");throw v&&(c+=\` (export \${v})\`),console.error(\`[hydrate] Error parsing props for component \${c}\`,this.getAttribute("props"),o),o}let a,u=this.hydrator(this);a=performance.now(),await u(this.Component,m,r,{client:this.getAttribute("client")}),a&&this.setAttribute("client-render-time",(performance.now()-a).toString()),this.removeAttribute("ssr"),this.dispatchEvent(new CustomEvent("astro:hydrate"))});l(this,"unmount",()=>{this.isConnected||this.dispatchEvent(new CustomEvent("astro:unmount"))})}disconnectedCallback(){document.removeEventListener("astro:after-swap",this.unmount),document.addEventListener("astro:after-swap",this.unmount,{once:!0})}connectedCallback(){if(!this.hasAttribute("await-children")||document.readyState==="interactive"||document.readyState==="complete")this.childrenConnectedCallback();else{let e=()=>{document.removeEventListener("DOMContentLoaded",e),n.disconnect(),this.childrenConnectedCallback()},n=new MutationObserver(()=>{var r;((r=this.lastChild)==null?void 0:r.nodeType)===Node.COMMENT_NODE&&this.lastChild.nodeValue==="astro:end"&&(this.lastChild.remove(),e())});n.observe(this,{childList:!0}),document.addEventListener("DOMContentLoaded",e)}}async childrenConnectedCallback(){let e=this.getAttribute("before-hydration-url");e&&await import(e),this.start()}getRetryImportUrl(e){let n=new URL(e,document.baseURI),r=\`astro-retry=\${Date.now()}\`,i=n.hash.replace(/^#/,"");return n.hash=i?\`\${i}&\${r}\`:r,n.toString()}async importWithRetry(e){try{return await import(e)}catch(n){return await new Promise(r=>setTimeout(r,1e3)),import(this.getRetryImportUrl(e))}}handleHydrationError(e){let n=this.getAttribute("component-url"),r=new CustomEvent("astro:hydration-error",{cancelable:!0,bubbles:!0,composed:!0,detail:{error:e,componentUrl:n}});this.dispatchEvent(r)&&console.error(\`[astro-island] Error hydrating \${n}\`,e)}async start(){let e=JSON.parse(this.getAttribute("opts")),n=this.getAttribute("client");if(Astro[n]===void 0){window.addEventListener(\`astro:\${n}\`,()=>this.start(),{once:!0});return}try{await Astro[n](async()=>{let r=this.getAttribute("renderer-url");try{let[i,{default:m}]=await Promise.all([this.importWithRetry(this.getAttribute("component-url")),r?this.importWithRetry(r):Promise.resolve({default:()=>()=>{}})]),a=this.getAttribute("component-export")||"default";if(a.includes(".")){this.Component=i;for(let u of a.split(".")){if(E.has(u)||!this.Component||typeof this.Component!="object"&&typeof this.Component!="function"||!Object.hasOwn(this.Component,u))throw new Error(\`Invalid component export path: \${a}\`);this.Component=this.Component[u]}}else{if(E.has(a))throw new Error(\`Invalid component export path: \${a}\`);this.Component=i[a]}return this.hydrator=m,this.hydrate}catch(i){return this.handleHydrationError(i),()=>{}}},e,this)}catch(r){this.handleHydrationError(r)}}attributeChangedCallback(){this.hydrate()}}l(f,"observedAttributes",["props"]),customElements.get("astro-island")||customElements.define("astro-island",f)}})();`;
    const ISLAND_STYLES = "astro-island,astro-slot,astro-static-slot{display:contents}";
    function determineIfNeedsHydrationScript(result) {
        if (result._metadata.templateDepth > 0) {
            return !result._metadata.hasHydrationScript;
        }
        if (result._metadata.hasHydrationScript) {
            return false;
        }
        return result._metadata.hasHydrationScript = true;
    }
    function determinesIfNeedsDirectiveScript(result, directive) {
        if (result._metadata.templateDepth > 0) {
            return !result._metadata.hasDirectives.has(directive);
        }
        if (result._metadata.hasDirectives.has(directive)) {
            return false;
        }
        result._metadata.hasDirectives.add(directive);
        return true;
    }
    function getDirectiveScriptText(result, directive) {
        const clientDirectives = result.clientDirectives;
        const clientDirective = clientDirectives.get(directive);
        if (!clientDirective) {
            throw new Error(`Unknown directive: ${directive}`);
        }
        return clientDirective;
    }
    function getPrescripts(result, type, directive) {
        switch(type){
            case "both":
                return `<style>${ISLAND_STYLES}</style><script>${getDirectiveScriptText(result, directive)}</script><script>${process.env.NODE_ENV === "development" ? astro_island_prebuilt_dev_default : astro_island_prebuilt_default}</script>`;
            case "directive":
                return `<script>${getDirectiveScriptText(result, directive)}</script>`;
        }
    }
    async function collectPropagatedHeadParts(input) {
        const collectedHeadParts = [];
        const iterator = input.propagators.values();
        while(true){
            const { value, done } = iterator.next();
            if (done) {
                break;
            }
            const returnValue = await value.init(input.result);
            if (input.isHeadAndContent(returnValue) && returnValue.head) {
                collectedHeadParts.push(returnValue.head);
            }
        }
        return collectedHeadParts;
    }
    function shouldRenderHeadInstruction(state) {
        return !state.hasRenderedHead && !state.partial;
    }
    function shouldRenderMaybeHeadInstruction(state) {
        return !state.hasRenderedHead && !state.headInTree && !state.partial;
    }
    function shouldRenderInstruction$1(type, state) {
        return type === "head" ? shouldRenderHeadInstruction(state) : shouldRenderMaybeHeadInstruction(state);
    }
    function registerIfPropagating(result, factory, instance) {
        if (factory.propagation === "self" || factory.propagation === "in-tree") {
            result._metadata.propagators.add(instance);
            return;
        }
        if (factory.moduleId) {
            const hint = result.componentMetadata.get(factory.moduleId)?.propagation;
            if (isPropagatingHint(hint ?? "none")) {
                result._metadata.propagators.add(instance);
            }
        }
    }
    async function bufferPropagatedHead(result) {
        const collected = await collectPropagatedHeadParts({
            propagators: result._metadata.propagators,
            result,
            isHeadAndContent
        });
        result._metadata.extraHead.push(...collected);
    }
    function shouldRenderInstruction(type, state) {
        return shouldRenderInstruction$1(type, state);
    }
    function getInstructionRenderState(result) {
        return {
            hasRenderedHead: result._metadata.hasRenderedHead,
            headInTree: result._metadata.headInTree,
            partial: result.partial
        };
    }
    function renderCspContent(result) {
        const finalScriptHashes = new Set();
        const finalStyleHashes = new Set();
        for (const scriptHash of result.scriptHashes){
            finalScriptHashes.add(`'${scriptHash}'`);
        }
        for (const styleHash of result.styleHashes){
            finalStyleHashes.add(`'${styleHash}'`);
        }
        for (const styleHash of result._metadata.extraStyleHashes){
            finalStyleHashes.add(`'${styleHash}'`);
        }
        for (const scriptHash of result._metadata.extraScriptHashes){
            finalScriptHashes.add(`'${scriptHash}'`);
        }
        let directives;
        if (result.directives.length > 0) {
            directives = result.directives.join(";") + ";";
        }
        let scriptResources = "'self'";
        if (result.scriptResources.length > 0) {
            scriptResources = result.scriptResources.map((r)=>`${r}`).join(" ");
        }
        let styleResources = "'self'";
        if (result.styleResources.length > 0) {
            styleResources = result.styleResources.map((r)=>`${r}`).join(" ");
        }
        const strictDynamic = result.isStrictDynamic ? ` 'strict-dynamic'` : "";
        const scriptSrc = `script-src ${scriptResources} ${Array.from(finalScriptHashes).join(" ")}${strictDynamic};`;
        const styleSrc = `style-src ${styleResources} ${Array.from(finalStyleHashes).join(" ")};`;
        return [
            directives,
            scriptSrc,
            styleSrc
        ].filter(Boolean).join(" ");
    }
    const RenderInstructionSymbol = Symbol.for("astro:render");
    function createRenderInstruction(instruction) {
        return Object.defineProperty(instruction, RenderInstructionSymbol, {
            value: true
        });
    }
    function isRenderInstruction(chunk) {
        return chunk && typeof chunk === "object" && chunk[RenderInstructionSymbol];
    }
    const voidElementNames = /^(area|base|br|col|command|embed|hr|img|input|keygen|link|meta|param|source|track|wbr)$/i;
    const htmlBooleanAttributes = /^(?:allowfullscreen|async|autofocus|autoplay|checked|controls|default|defer|disabled|disablepictureinpicture|disableremoteplayback|formnovalidate|inert|loop|muted|nomodule|novalidate|open|playsinline|readonly|required|reversed|scoped|seamless|selected|itemscope)$/i;
    const AMPERSAND_REGEX = /&/g;
    const DOUBLE_QUOTE_REGEX = /"/g;
    const STATIC_DIRECTIVES = new Set([
        "set:html",
        "set:text"
    ]);
    const toIdent = (k)=>k.trim().replace(/(?!^)\b\w|\s+|\W+/g, (match, index)=>{
            if (/\W/.test(match)) return "";
            return index === 0 ? match : match.toUpperCase();
        });
    const toAttributeString = (value, shouldEscape = true)=>shouldEscape ? String(value).replace(AMPERSAND_REGEX, "&amp;").replace(DOUBLE_QUOTE_REGEX, "&quot;") : value;
    const kebab = (k)=>k.toLowerCase() === k ? k : k.replace(/[A-Z]/g, (match)=>`-${match.toLowerCase()}`);
    const toStyleString = (obj)=>Object.entries(obj).filter(([_, v])=>typeof v === "string" && v.trim() || typeof v === "number").map(([k, v])=>{
            if (k[0] !== "-" && k[1] !== "-") return `${kebab(k)}:${v}`;
            return `${k}:${v}`;
        }).join(";");
    defineScriptVars = function(vars) {
        let output = "";
        for (const [key, value] of Object.entries(vars)){
            output += `const ${toIdent(key)} = ${stringifyForScript(value)};
`;
        }
        return markHTMLString(output);
    };
    function formatList(values) {
        if (values.length === 1) {
            return values[0];
        }
        return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
    }
    function isCustomElement(tagName) {
        return tagName.includes("-");
    }
    function handleBooleanAttribute(key, value, shouldEscape, tagName) {
        if (tagName && isCustomElement(tagName)) {
            return markHTMLString(` ${key}="${toAttributeString(value, shouldEscape)}"`);
        }
        return markHTMLString(value ? ` ${key}` : "");
    }
    addAttribute = function(value, key, shouldEscape = true, tagName = "") {
        if (value == null) {
            return "";
        }
        if (STATIC_DIRECTIVES.has(key)) {
            console.warn(`[astro] The "${key}" directive cannot be applied dynamically at runtime. It will not be rendered as an attribute.

Make sure to use the static attribute syntax (\`${key}={value}\`) instead of the dynamic spread syntax (\`{...{ "${key}": value }}\`).`);
            return "";
        }
        if (key === "class:list") {
            const listValue = toAttributeString(clsx(value), shouldEscape);
            if (listValue === "") {
                return "";
            }
            return markHTMLString(` ${key.slice(0, -5)}="${listValue}"`);
        }
        if (key === "style" && !(value instanceof HTMLString)) {
            if (Array.isArray(value) && value.length === 2) {
                return markHTMLString(` ${key}="${toAttributeString(`${toStyleString(value[0])};${value[1]}`, shouldEscape)}"`);
            }
            if (typeof value === "object") {
                return markHTMLString(` ${key}="${toAttributeString(toStyleString(value), shouldEscape)}"`);
            }
        }
        if (key === "className") {
            return markHTMLString(` class="${toAttributeString(value, shouldEscape)}"`);
        }
        if (htmlBooleanAttributes.test(key)) {
            return handleBooleanAttribute(key, value, shouldEscape, tagName);
        }
        if (value === "") {
            return markHTMLString(` ${key}`);
        }
        if (key === "popover" && typeof value === "boolean") {
            return handleBooleanAttribute(key, value, shouldEscape, tagName);
        }
        if (key === "download" && typeof value === "boolean") {
            return handleBooleanAttribute(key, value, shouldEscape, tagName);
        }
        if (key === "hidden" && typeof value === "boolean") {
            return handleBooleanAttribute(key, value, shouldEscape, tagName);
        }
        return markHTMLString(` ${key}="${toAttributeString(value, shouldEscape)}"`);
    };
    function internalSpreadAttributes(values, shouldEscape = true, tagName) {
        let output = "";
        for (const [key, value] of Object.entries(values)){
            output += addAttribute(value, key, shouldEscape, tagName);
        }
        return markHTMLString(output);
    }
    function renderElement$1(name, { props: _props, children = "" }, shouldEscape = true) {
        const { lang: _, "data-astro-id": astroId, "define:vars": defineVars, ...props } = _props;
        if (defineVars) {
            if (name === "style") {
                delete props["is:global"];
                delete props["is:scoped"];
            }
            if (name === "script") {
                delete props.hoist;
                children = defineScriptVars(defineVars) + "\n" + children;
            }
        }
        if ((children == null || children === "") && voidElementNames.test(name)) {
            return `<${name}${internalSpreadAttributes(props, shouldEscape, name)}>`;
        }
        return `<${name}${internalSpreadAttributes(props, shouldEscape, name)}>${children}</${name}>`;
    }
    const noop = ()=>{};
    class BufferedRenderer {
        chunks = [];
        renderPromise;
        destination;
        flushed = false;
        constructor(destination, renderFunction){
            this.destination = destination;
            this.renderPromise = renderFunction(this);
            if (isPromise(this.renderPromise)) {
                Promise.resolve(this.renderPromise).catch(noop);
            }
        }
        write(chunk) {
            if (this.flushed) {
                this.destination.write(chunk);
            } else {
                this.chunks.push(chunk);
            }
        }
        flush() {
            if (this.flushed) {
                throw new Error("The render buffer has already been flushed.");
            }
            this.flushed = true;
            for (const chunk of this.chunks){
                this.destination.write(chunk);
            }
            return this.renderPromise;
        }
    }
    function createBufferedRenderer(destination, renderFunction) {
        return new BufferedRenderer(destination, renderFunction);
    }
    const isNode = typeof process !== "undefined" && Object.prototype.toString.call(process) === "[object process]" && !(typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers");
    const isDeno = typeof Deno !== "undefined";
    function promiseWithResolvers() {
        let resolve, reject;
        const promise = new Promise((_resolve, _reject)=>{
            resolve = _resolve;
            reject = _reject;
        });
        return {
            promise,
            resolve,
            reject
        };
    }
    function stablePropsKey(props) {
        const keys = Object.keys(props).sort();
        let result = "{";
        for(let i = 0; i < keys.length; i++){
            if (i > 0) result += ",";
            result += JSON.stringify(keys[i]) + ":" + JSON.stringify(props[keys[i]]);
        }
        result += "}";
        return result;
    }
    function deduplicateElements(elements) {
        if (elements.length <= 1) return elements;
        const seen = new Set();
        return elements.filter((item)=>{
            const key = stablePropsKey(item.props) + item.children;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
    function renderAllHeadContent(result) {
        result._metadata.hasRenderedHead = true;
        let content = "";
        if (result.shouldInjectCspMetaTags && result.cspDestination === "meta") {
            content += renderElement$1("meta", {
                props: {
                    "http-equiv": "content-security-policy",
                    content: renderCspContent(result)
                },
                children: ""
            }, false);
        }
        const styles = deduplicateElements(Array.from(result.styles)).map((style)=>style.props.rel === "stylesheet" ? renderElement$1("link", style) : renderElement$1("style", style));
        result.styles.clear();
        const scripts = deduplicateElements(Array.from(result.scripts)).map((script)=>{
            if (result.userAssetsBase) {
                script.props.src = (result.base === "/" ? "" : result.base) + result.userAssetsBase + script.props.src;
            }
            return renderElement$1("script", script, false);
        });
        const links = deduplicateElements(Array.from(result.links)).map((link)=>renderElement$1("link", link, false));
        content += styles.join("\n") + links.join("\n") + scripts.join("\n");
        content += result._metadata.extraHead.join("");
        return markHTMLString(content);
    }
    renderHead = function() {
        return createRenderInstruction({
            type: "head"
        });
    };
    maybeRenderHead = function() {
        return createRenderInstruction({
            type: "maybe-head"
        });
    };
    const ALGORITHMS = {
        "SHA-256": "sha256-",
        "SHA-384": "sha384-",
        "SHA-512": "sha512-"
    };
    const ALGORITHM_VALUES = Object.values(ALGORITHMS);
    z.enum(Object.keys(ALGORITHMS)).optional().default("SHA-256");
    z.custom((value)=>{
        if (typeof value !== "string") {
            return false;
        }
        return ALGORITHM_VALUES.some((allowedValue)=>{
            return value.startsWith(allowedValue);
        });
    });
    const ALLOWED_DIRECTIVES = [
        "base-uri",
        "child-src",
        "connect-src",
        "default-src",
        "fenced-frame-src",
        "font-src",
        "form-action",
        "frame-ancestors",
        "frame-src",
        "img-src",
        "manifest-src",
        "media-src",
        "object-src",
        "referrer",
        "report-to",
        "report-uri",
        "require-trusted-types-for",
        "sandbox",
        "trusted-types",
        "upgrade-insecure-requests",
        "worker-src"
    ];
    z.custom((v)=>typeof v === "string").superRefine((value, ctx)=>{
        const isAllowed = ALLOWED_DIRECTIVES.some((allowedValue)=>{
            return value.startsWith(allowedValue);
        });
        if (!isAllowed) {
            if (value.startsWith("script-src") || value.startsWith("style-src")) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Directives \`script-src\` and \`style-src\` are not allowed in \`security.csp.directives\`. Please use \`security.csp.scriptDirective\` and \`security.csp.styleDirective\` instead.`,
                    fatal: true
                });
            } else {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Invalid directive: "${value}". Allowed directives are: ${ALLOWED_DIRECTIVES.join(", ")}`,
                    fatal: true
                });
            }
        }
    });
    const ALGORITHM = "AES-GCM";
    async function decodeKey(encoded) {
        const bytes = decodeBase64(encoded);
        return crypto.subtle.importKey("raw", bytes.buffer, ALGORITHM, true, [
            "encrypt",
            "decrypt"
        ]);
    }
    const encoder$1 = new TextEncoder();
    const decoder$1 = new TextDecoder();
    const IV_LENGTH = 24;
    async function encryptString(key, raw, additionalData) {
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH / 2));
        const data = encoder$1.encode(raw);
        const params = {
            name: ALGORITHM,
            iv
        };
        if (additionalData) {
            params.additionalData = encoder$1.encode(additionalData);
        }
        const buffer = await crypto.subtle.encrypt(params, key, data);
        return encodeHexUpperCase(iv) + encodeBase64(new Uint8Array(buffer));
    }
    async function decryptString(key, encoded, additionalData) {
        const iv = decodeHex(encoded.slice(0, IV_LENGTH));
        const dataArray = decodeBase64(encoded.slice(IV_LENGTH));
        const params = {
            name: ALGORITHM,
            iv
        };
        if (additionalData) {
            params.additionalData = encoder$1.encode(additionalData);
        }
        const decryptedBuffer = await crypto.subtle.decrypt(params, key, dataArray);
        const decryptedString = decoder$1.decode(decryptedBuffer);
        return decryptedString;
    }
    async function generateCspDigest(data, algorithm) {
        const hashBuffer = await crypto.subtle.digest(algorithm, encoder$1.encode(data));
        const hash = encodeBase64(new Uint8Array(hashBuffer));
        return `${ALGORITHMS[algorithm]}${hash}`;
    }
    const renderTemplateResultSym = Symbol.for("astro.renderTemplateResult");
    class RenderTemplateResult {
        [renderTemplateResultSym] = true;
        htmlParts;
        expressions;
        error;
        constructor(htmlParts, expressions){
            this.htmlParts = htmlParts;
            this.error = void 0;
            this.expressions = expressions.map((expression)=>{
                if (isPromise(expression)) {
                    return Promise.resolve(expression).catch((err)=>{
                        if (!this.error) {
                            this.error = err;
                            throw err;
                        }
                    });
                }
                return expression;
            });
        }
        render(destination) {
            const { htmlParts, expressions } = this;
            for(let i = 0; i < htmlParts.length; i++){
                const html = htmlParts[i];
                if (html) {
                    destination.write(markHTMLString(html));
                }
                if (i >= expressions.length) break;
                const exp = expressions[i];
                if (!(exp || exp === 0)) continue;
                const result = renderChild(destination, exp);
                if (isPromise(result)) {
                    const startIdx = i + 1;
                    const remaining = expressions.length - startIdx;
                    const flushers = new Array(remaining);
                    for(let j = 0; j < remaining; j++){
                        const rExp = expressions[startIdx + j];
                        flushers[j] = createBufferedRenderer(destination, (bufferDestination)=>{
                            if (rExp || rExp === 0) {
                                return renderChild(bufferDestination, rExp);
                            }
                        });
                    }
                    return result.then(()=>{
                        let k = 0;
                        const iterate = ()=>{
                            while(k < flushers.length){
                                const rHtml = htmlParts[startIdx + k];
                                if (rHtml) {
                                    destination.write(markHTMLString(rHtml));
                                }
                                const flushResult = flushers[k++].flush();
                                if (isPromise(flushResult)) {
                                    return flushResult.then(iterate);
                                }
                            }
                            const lastHtml = htmlParts[htmlParts.length - 1];
                            if (lastHtml) {
                                destination.write(markHTMLString(lastHtml));
                            }
                        };
                        return iterate();
                    });
                }
            }
        }
    }
    function isRenderTemplateResult(obj) {
        return typeof obj === "object" && obj !== null && !!obj[renderTemplateResultSym];
    }
    renderTemplate = function(htmlParts, ...expressions) {
        return new RenderTemplateResult(htmlParts, expressions);
    };
    const slotString = Symbol.for("astro:slot-string");
    class SlotString extends HTMLString {
        instructions;
        [slotString];
        constructor(content, instructions){
            super(content);
            this.instructions = instructions;
            this[slotString] = true;
        }
    }
    function isSlotString(str) {
        return !!str[slotString];
    }
    function mergeSlotInstructions(target, source) {
        if (source.instructions?.length) {
            target ??= [];
            target.push(...source.instructions);
        }
        return target;
    }
    function renderSlot(result, slotted, fallback) {
        return {
            async render (destination) {
                await renderChild(destination, typeof slotted === "function" ? slotted(result) : slotted);
            }
        };
    }
    async function renderSlotToString(result, slotted, fallback) {
        let content = "";
        let instructions = null;
        const temporaryDestination = {
            write (chunk) {
                if (chunk instanceof SlotString) {
                    content += chunk;
                    instructions = mergeSlotInstructions(instructions, chunk);
                } else if (chunk instanceof Response) return;
                else if (typeof chunk === "object" && "type" in chunk && typeof chunk.type === "string") {
                    if (instructions === null) {
                        instructions = [];
                    }
                    instructions.push(chunk);
                } else {
                    content += chunkToString(result, chunk);
                }
            }
        };
        const renderInstance = renderSlot(result, slotted);
        await renderInstance.render(temporaryDestination);
        return markHTMLString(new SlotString(content, instructions));
    }
    async function renderSlots(result, slots = {}) {
        let slotInstructions = null;
        let children = {};
        if (slots) {
            await Promise.all(Object.entries(slots).map(([key, value])=>renderSlotToString(result, value).then((output)=>{
                    if (output.instructions) {
                        if (slotInstructions === null) {
                            slotInstructions = [];
                        }
                        slotInstructions.push(...output.instructions);
                    }
                    children[key] = output;
                })));
        }
        return {
            slotInstructions,
            children
        };
    }
    function createSlotValueFromString(content) {
        return function() {
            return renderTemplate`${unescapeHTML(content)}`;
        };
    }
    const internalProps = new Set([
        "server:component-path",
        "server:component-export",
        "server:component-directive",
        "server:defer"
    ]);
    function containsServerDirective(props) {
        return "server:component-directive" in props;
    }
    function createSearchParams(encryptedComponentExport, encryptedProps, slots) {
        const params = new URLSearchParams();
        params.set("e", encryptedComponentExport);
        params.set("p", encryptedProps);
        params.set("s", slots);
        return params;
    }
    function isWithinURLLimit(pathname, params) {
        const url = pathname + "?" + params.toString();
        const chars = url.length;
        return chars < 2048;
    }
    class ServerIslandComponent {
        result;
        props;
        slots;
        displayName;
        hostId;
        islandContent;
        componentPath;
        componentExport;
        componentId;
        constructor(result, props, slots, displayName){
            this.result = result;
            this.props = props;
            this.slots = slots;
            this.displayName = displayName;
        }
        async init() {
            const content = await this.getIslandContent();
            if (this.result.cspDestination) {
                this.result._metadata.extraScriptHashes.push(await generateCspDigest(SERVER_ISLAND_REPLACER, this.result.cspAlgorithm));
                const contentDigest = await generateCspDigest(content, this.result.cspAlgorithm);
                this.result._metadata.extraScriptHashes.push(contentDigest);
            }
            return createThinHead();
        }
        async render(destination) {
            const hostId = await this.getHostId();
            const islandContent = await this.getIslandContent();
            destination.write(createRenderInstruction({
                type: "server-island-runtime"
            }));
            destination.write("<!--[if astro]>server-island-start<![endif]-->");
            for(const name in this.slots){
                if (name === "fallback") {
                    await renderChild(destination, this.slots.fallback(this.result));
                }
            }
            destination.write(`<script type="module" data-astro-rerun data-island-id="${hostId}">${islandContent}</script>`);
        }
        getComponentPath() {
            if (this.componentPath) {
                return this.componentPath;
            }
            const componentPath = this.props["server:component-path"];
            if (!componentPath) {
                throw new Error(`Could not find server component path`);
            }
            this.componentPath = componentPath;
            return componentPath;
        }
        getComponentExport() {
            if (this.componentExport) {
                return this.componentExport;
            }
            const componentExport = this.props["server:component-export"];
            if (!componentExport) {
                throw new Error(`Could not find server component export`);
            }
            this.componentExport = componentExport;
            return componentExport;
        }
        async getHostId() {
            if (!this.hostId) {
                this.hostId = await crypto.randomUUID();
            }
            return this.hostId;
        }
        async getIslandContent() {
            if (this.islandContent) {
                return this.islandContent;
            }
            const componentPath = this.getComponentPath();
            const componentExport = this.getComponentExport();
            const serverIslandNameMap = await this.result.getServerIslandNameMap();
            let componentId = serverIslandNameMap.get(componentPath);
            if (!componentId) {
                throw new Error(`Could not find server component name ${componentPath}`);
            }
            for (const key2 of Object.keys(this.props)){
                if (internalProps.has(key2)) {
                    delete this.props[key2];
                }
            }
            const renderedSlots = {};
            for(const name in this.slots){
                if (name !== "fallback") {
                    const content = await renderSlotToString(this.result, this.slots[name]);
                    let slotHtml = content.toString();
                    const slotContent = content;
                    if (Array.isArray(slotContent.instructions)) {
                        for (const instruction of slotContent.instructions){
                            if (instruction.type === "script") {
                                slotHtml += instruction.content;
                            }
                        }
                    }
                    renderedSlots[name] = slotHtml;
                }
            }
            const key = await this.result.key;
            const componentExportEncrypted = await encryptString(key, componentExport, `export:${componentId}`);
            const propsEncrypted = Object.keys(this.props).length === 0 ? "" : await encryptString(key, JSON.stringify(this.props), `props:${componentId}`);
            const slotsEncrypted = Object.keys(renderedSlots).length === 0 ? "" : await encryptString(key, JSON.stringify(renderedSlots), `slots:${componentId}`);
            const hostId = await this.getHostId();
            const slash = this.result.base.endsWith("/") ? "" : "/";
            let serverIslandUrl = `${this.result.base}${slash}_server-islands/${componentId}${this.result.trailingSlash === "always" ? "/" : ""}`;
            const potentialSearchParams = createSearchParams(componentExportEncrypted, propsEncrypted, slotsEncrypted);
            const useGETRequest = isWithinURLLimit(serverIslandUrl, potentialSearchParams);
            if (useGETRequest) {
                serverIslandUrl += "?" + potentialSearchParams.toString();
                this.result._metadata.extraHead.push(markHTMLString(`<link rel="preload" as="fetch" href="${serverIslandUrl}" crossorigin="anonymous">`));
            }
            const adapterHeaders = this.result.internalFetchHeaders || {};
            const headersJson = stringifyForScript(adapterHeaders);
            const method = useGETRequest ? (`const headers = new Headers(${headersJson});
let response = await fetch('${serverIslandUrl}', { headers });`) : (`let data = {
	encryptedComponentExport: ${stringifyForScript(componentExportEncrypted)},
	encryptedProps: ${stringifyForScript(propsEncrypted)},
	encryptedSlots: ${stringifyForScript(slotsEncrypted)},
};
const headers = new Headers({ 'Content-Type': 'application/json', ...${headersJson} });
let response = await fetch('${serverIslandUrl}', {
	method: 'POST',
	body: JSON.stringify(data),
	headers,
});`);
            this.islandContent = `${method}replaceServerIsland('${hostId}', response);`;
            return this.islandContent;
        }
    }
    const renderServerIslandRuntime = ()=>{
        return `<script>${SERVER_ISLAND_REPLACER}</script>`;
    };
    const SERVER_ISLAND_REPLACER = markHTMLString(`async function replaceServerIsland(id, r) {
	let s = document.querySelector(\`script[data-island-id="\${id}"]\`);
	// If there's no matching script, or the request fails then return
	if (!s || r.status !== 200 || r.headers.get('content-type')?.split(';')[0].trim() !== 'text/html') return;
	// Load the HTML before modifying the DOM in case of errors
	let html = await r.text();
	// Remove any placeholder content before the island script
	while (s.previousSibling && s.previousSibling.nodeType !== 8 && s.previousSibling.data !== '[if astro]>server-island-start<![endif]')
		s.previousSibling.remove();
	s.previousSibling?.remove();
	// Insert the new HTML
	s.before(document.createRange().createContextualFragment(html));
	// Remove the script. Prior to v5.4.2, this was the trick to force rerun of scripts.  Keeping it to minimize change to the existing behavior.
	s.remove();
}`.split("\n").map((line)=>line.trim()).filter((line)=>line && !line.startsWith("//")).join(" "));
    const Fragment = Symbol.for("astro:fragment");
    const Renderer = Symbol.for("astro:renderer");
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    function stringifyChunk(result, chunk) {
        if (isRenderInstruction(chunk)) {
            const instruction = chunk;
            switch(instruction.type){
                case "directive":
                    {
                        const { hydration } = instruction;
                        const needsHydrationScript = hydration && determineIfNeedsHydrationScript(result);
                        const needsDirectiveScript = hydration && determinesIfNeedsDirectiveScript(result, hydration.directive);
                        if (needsHydrationScript) {
                            const prescripts = getPrescripts(result, "both", hydration.directive);
                            return markHTMLString(prescripts);
                        } else if (needsDirectiveScript) {
                            const prescripts = getPrescripts(result, "directive", hydration.directive);
                            return markHTMLString(prescripts);
                        } else {
                            return "";
                        }
                    }
                case "head":
                    {
                        if (!shouldRenderInstruction("head", getInstructionRenderState(result))) {
                            return "";
                        }
                        return renderAllHeadContent(result);
                    }
                case "maybe-head":
                    {
                        if (!shouldRenderInstruction("maybe-head", getInstructionRenderState(result))) {
                            return "";
                        }
                        return renderAllHeadContent(result);
                    }
                case "renderer-hydration-script":
                    {
                        const { rendererSpecificHydrationScripts } = result._metadata;
                        const { rendererName } = instruction;
                        if (result._metadata.templateDepth > 0) {
                            return instruction.render();
                        }
                        if (!rendererSpecificHydrationScripts.has(rendererName)) {
                            rendererSpecificHydrationScripts.add(rendererName);
                            return instruction.render();
                        }
                        return "";
                    }
                case "server-island-runtime":
                    {
                        if (result._metadata.templateDepth > 0) {
                            return renderServerIslandRuntime();
                        }
                        if (result._metadata.hasRenderedServerIslandRuntime) {
                            return "";
                        }
                        result._metadata.hasRenderedServerIslandRuntime = true;
                        return renderServerIslandRuntime();
                    }
                case "script":
                    {
                        const { id, content } = instruction;
                        if (result._metadata.templateDepth > 0) {
                            return content;
                        }
                        if (result._metadata.renderedScripts.has(id)) {
                            return "";
                        }
                        result._metadata.renderedScripts.add(id);
                        return content;
                    }
                case "template-enter":
                    {
                        result._metadata.templateDepth++;
                        return "";
                    }
                case "template-exit":
                    {
                        if (result._metadata.templateDepth <= 0) {
                            throw new Error("Unexpected template-exit instruction without a matching template-enter. This may indicate that the compiler emitted unbalanced template boundaries, or that a component manually injected a template-exit render instruction.");
                        }
                        result._metadata.templateDepth--;
                        return "";
                    }
                default:
                    {
                        throw new Error(`Unknown chunk type: ${chunk.type}`);
                    }
            }
        } else if (chunk instanceof Response) {
            return "";
        } else if (isSlotString(chunk)) {
            let out = "";
            const c = chunk;
            if (c.instructions) {
                for (const instr of c.instructions){
                    out += stringifyChunk(result, instr);
                }
            }
            out += chunk.toString();
            return out;
        }
        return chunk.toString();
    }
    function chunkToString(result, chunk) {
        if (ArrayBuffer.isView(chunk)) {
            return decoder.decode(chunk);
        } else {
            return stringifyChunk(result, chunk);
        }
    }
    function chunkToByteArray(result, chunk) {
        if (ArrayBuffer.isView(chunk)) {
            return chunk;
        } else {
            const stringified = stringifyChunk(result, chunk);
            return encoder.encode(stringified.toString());
        }
    }
    function chunkToByteArrayOrString(result, chunk) {
        if (ArrayBuffer.isView(chunk)) {
            return chunk;
        } else {
            return stringifyChunk(result, chunk).toString();
        }
    }
    function isRenderInstance(obj) {
        return !!obj && typeof obj === "object" && "render" in obj && typeof obj.render === "function";
    }
    function renderChild(destination, child) {
        if (typeof child === "string") {
            destination.write(markHTMLString(escapeHTML(child)));
            return;
        }
        if (isPromise(child)) {
            return child.then((x)=>renderChild(destination, x));
        }
        if (child instanceof SlotString) {
            destination.write(child);
            return;
        }
        if (isHTMLString(child)) {
            destination.write(child);
            return;
        }
        if (!child && child !== 0) {
            return;
        }
        if (Array.isArray(child)) {
            return renderArray(destination, child);
        }
        if (typeof child === "function") {
            return renderChild(destination, child());
        }
        if (isRenderInstance(child)) {
            return child.render(destination);
        }
        if (isRenderTemplateResult(child)) {
            return child.render(destination);
        }
        if (isAstroComponentInstance(child)) {
            return child.render(destination);
        }
        if (ArrayBuffer.isView(child)) {
            destination.write(child);
            return;
        }
        if (typeof child === "object" && (Symbol.asyncIterator in child || Symbol.iterator in child)) {
            if (Symbol.asyncIterator in child) {
                return renderAsyncIterable(destination, child);
            }
            return renderIterable(destination, child);
        }
        destination.write(child);
    }
    function renderArray(destination, children) {
        for(let i = 0; i < children.length; i++){
            const result = renderChild(destination, children[i]);
            if (isPromise(result)) {
                if (i + 1 >= children.length) {
                    return result;
                }
                const remaining = children.length - i - 1;
                const flushers = new Array(remaining);
                for(let j = 0; j < remaining; j++){
                    flushers[j] = createBufferedRenderer(destination, (bufferDestination)=>{
                        return renderChild(bufferDestination, children[i + 1 + j]);
                    });
                }
                return result.then(()=>{
                    let k = 0;
                    const iterate = ()=>{
                        while(k < flushers.length){
                            const flushResult = flushers[k++].flush();
                            if (isPromise(flushResult)) {
                                return flushResult.then(iterate);
                            }
                        }
                    };
                    return iterate();
                });
            }
        }
    }
    function renderIterable(destination, children) {
        const iterator = children[Symbol.iterator]();
        const iterate = ()=>{
            for(;;){
                const { value, done } = iterator.next();
                if (done) {
                    break;
                }
                const result = renderChild(destination, value);
                if (isPromise(result)) {
                    return result.then(iterate);
                }
            }
        };
        return iterate();
    }
    async function renderAsyncIterable(destination, children) {
        for await (const value of children){
            await renderChild(destination, value);
        }
    }
    const astroComponentInstanceSym = Symbol.for("astro.componentInstance");
    class AstroComponentInstance {
        [astroComponentInstanceSym] = true;
        result;
        props;
        slotValues;
        factory;
        returnValue;
        constructor(result, props, slots, factory){
            this.result = result;
            this.props = props;
            this.factory = factory;
            this.slotValues = {};
            for(const name in slots){
                let didRender = false;
                let value = slots[name](result);
                this.slotValues[name] = ()=>{
                    if (!didRender) {
                        didRender = true;
                        return value;
                    }
                    return slots[name](result);
                };
            }
        }
        init(result) {
            if (this.returnValue !== void 0) {
                return this.returnValue;
            }
            this.returnValue = this.factory(result, this.props, this.slotValues);
            if (isPromise(this.returnValue)) {
                this.returnValue.then((resolved)=>{
                    this.returnValue = resolved;
                }).catch(()=>{});
            }
            return this.returnValue;
        }
        render(destination) {
            const returnValue = this.init(this.result);
            if (isPromise(returnValue)) {
                return returnValue.then((x)=>this.renderImpl(destination, x));
            }
            return this.renderImpl(destination, returnValue);
        }
        renderImpl(destination, returnValue) {
            if (isHeadAndContent(returnValue)) {
                return returnValue.content.render(destination);
            } else {
                return renderChild(destination, returnValue);
            }
        }
    }
    function validateComponentProps(props, clientDirectives, displayName) {
        if (props != null) {
            const directives = [
                ...clientDirectives.keys()
            ].map((directive)=>`client:${directive}`);
            for (const prop of Object.keys(props)){
                if (directives.includes(prop)) {
                    console.warn(`You are attempting to render <${displayName} ${prop} />, but ${displayName} is an Astro component. Astro components do not render in the client and should not have a hydration directive. Please use a framework component for client rendering.`);
                }
            }
        }
    }
    function createAstroComponentInstance(result, displayName, factory, props, slots = {}) {
        validateComponentProps(props, result.clientDirectives, displayName);
        const instance = new AstroComponentInstance(result, props, slots, factory);
        registerIfPropagating(result, factory, instance);
        return instance;
    }
    function isAstroComponentInstance(obj) {
        return typeof obj === "object" && obj !== null && !!obj[astroComponentInstanceSym];
    }
    const DOCTYPE_EXP = /<!doctype html/i;
    async function renderToString(result, componentFactory, props, children, isPage = false, route) {
        const templateResult = await callComponentAsTemplateResultOrResponse(result, componentFactory, props, children, route);
        if (templateResult instanceof Response) return templateResult;
        let str = "";
        let renderedFirstPageChunk = false;
        if (isPage) {
            await bufferHeadContent(result);
        }
        const destination = {
            write (chunk) {
                if (isPage && !renderedFirstPageChunk) {
                    renderedFirstPageChunk = true;
                    if (!result.partial && !DOCTYPE_EXP.test(String(chunk))) {
                        const doctype = result.compressHTML ? "<!DOCTYPE html>" : "<!DOCTYPE html>\n";
                        str += doctype;
                    }
                }
                if (chunk instanceof Response) return;
                str += chunkToString(result, chunk);
            }
        };
        await templateResult.render(destination);
        return str;
    }
    async function renderToReadableStream(result, componentFactory, props, children, isPage = false, route) {
        const templateResult = await callComponentAsTemplateResultOrResponse(result, componentFactory, props, children, route);
        if (templateResult instanceof Response) return templateResult;
        let renderedFirstPageChunk = false;
        if (isPage) {
            await bufferHeadContent(result);
        }
        return new ReadableStream({
            start (controller) {
                const destination = {
                    write (chunk) {
                        if (isPage && !renderedFirstPageChunk) {
                            renderedFirstPageChunk = true;
                            if (!result.partial && !DOCTYPE_EXP.test(String(chunk))) {
                                const doctype = result.compressHTML ? "<!DOCTYPE html>" : "<!DOCTYPE html>\n";
                                controller.enqueue(encoder.encode(doctype));
                            }
                        }
                        if (chunk instanceof Response) {
                            throw new AstroError({
                                ...ResponseSentError
                            });
                        }
                        const bytes = chunkToByteArray(result, chunk);
                        controller.enqueue(bytes);
                    }
                };
                (async ()=>{
                    try {
                        await templateResult.render(destination);
                        controller.close();
                    } catch (e) {
                        if (AstroError.is(e) && !e.loc) {
                            e.setLocation({
                                file: route?.component
                            });
                        }
                        setTimeout(()=>controller.error(e), 0);
                    }
                })();
            },
            cancel () {
                result.cancelled = true;
            }
        });
    }
    async function callComponentAsTemplateResultOrResponse(result, componentFactory, props, children, route) {
        const factoryResult = await componentFactory(result, props, children);
        if (factoryResult instanceof Response) {
            return factoryResult;
        } else if (isHeadAndContent(factoryResult)) {
            if (!isRenderTemplateResult(factoryResult.content)) {
                throw new AstroError({
                    ...OnlyResponseCanBeReturned,
                    message: OnlyResponseCanBeReturned.message(route?.route, typeof factoryResult),
                    location: {
                        file: route?.component
                    }
                });
            }
            return factoryResult.content;
        } else if (!isRenderTemplateResult(factoryResult)) {
            throw new AstroError({
                ...OnlyResponseCanBeReturned,
                message: OnlyResponseCanBeReturned.message(route?.route, typeof factoryResult),
                location: {
                    file: route?.component
                }
            });
        }
        return factoryResult;
    }
    async function bufferHeadContent(result) {
        await bufferPropagatedHead(result);
    }
    async function renderToAsyncIterable(result, componentFactory, props, children, isPage = false, route) {
        const templateResult = await callComponentAsTemplateResultOrResponse(result, componentFactory, props, children, route);
        if (templateResult instanceof Response) return templateResult;
        let renderedFirstPageChunk = false;
        if (isPage) {
            await bufferHeadContent(result);
        }
        let error = null;
        let next = null;
        const buffer = [];
        let renderingComplete = false;
        const iterator = {
            async next () {
                if (result.cancelled) return {
                    done: true,
                    value: void 0
                };
                if (next !== null) {
                    await next.promise;
                } else if (!renderingComplete && !buffer.length) {
                    next = promiseWithResolvers();
                    await next.promise;
                }
                if (!renderingComplete) {
                    next = promiseWithResolvers();
                }
                if (error) {
                    throw error;
                }
                let length = 0;
                let stringToEncode = "";
                for(let i = 0, len = buffer.length; i < len; i++){
                    const bufferEntry = buffer[i];
                    if (typeof bufferEntry === "string") {
                        const nextIsString = i + 1 < len && typeof buffer[i + 1] === "string";
                        stringToEncode += bufferEntry;
                        if (!nextIsString) {
                            const encoded = encoder.encode(stringToEncode);
                            length += encoded.length;
                            stringToEncode = "";
                            buffer[i] = encoded;
                        } else {
                            buffer[i] = "";
                        }
                    } else {
                        length += bufferEntry.length;
                    }
                }
                let mergedArray = new Uint8Array(length);
                let offset = 0;
                for(let i = 0, len = buffer.length; i < len; i++){
                    const item = buffer[i];
                    if (item === "") {
                        continue;
                    }
                    mergedArray.set(item, offset);
                    offset += item.length;
                }
                buffer.length = 0;
                const returnValue = {
                    done: length === 0 && renderingComplete,
                    value: mergedArray
                };
                return returnValue;
            },
            async return () {
                result.cancelled = true;
                return {
                    done: true,
                    value: void 0
                };
            }
        };
        const destination = {
            write (chunk) {
                if (isPage && !renderedFirstPageChunk) {
                    renderedFirstPageChunk = true;
                    if (!result.partial && !DOCTYPE_EXP.test(String(chunk))) {
                        const doctype = result.compressHTML ? "<!DOCTYPE html>" : "<!DOCTYPE html>\n";
                        buffer.push(encoder.encode(doctype));
                    }
                }
                if (chunk instanceof Response) {
                    throw new AstroError(ResponseSentError);
                }
                const bytes = chunkToByteArrayOrString(result, chunk);
                if (bytes.length > 0) {
                    buffer.push(bytes);
                    next?.resolve();
                } else if (buffer.length > 0) {
                    next?.resolve();
                }
            }
        };
        const renderResult = toPromise(()=>templateResult.render(destination));
        renderResult.catch((err)=>{
            error = err;
        }).finally(()=>{
            renderingComplete = true;
            next?.resolve();
        });
        return {
            [Symbol.asyncIterator] () {
                return iterator;
            }
        };
    }
    function toPromise(fn) {
        try {
            const result = fn();
            return isPromise(result) ? result : Promise.resolve(result);
        } catch (err) {
            return Promise.reject(err);
        }
    }
    function componentIsHTMLElement(Component) {
        return typeof HTMLElement !== "undefined" && HTMLElement.isPrototypeOf(Component);
    }
    async function renderHTMLElement$1(result, constructor, props, slots) {
        const name = getHTMLElementName(constructor);
        let attrHTML = "";
        for(const attr in props){
            attrHTML += ` ${attr}="${toAttributeString(await props[attr])}"`;
        }
        return markHTMLString(`<${name}${attrHTML}>${await renderSlotToString(result, slots?.default)}</${name}>`);
    }
    function getHTMLElementName(constructor) {
        const definedName = customElements.getName(constructor);
        if (definedName) return definedName;
        const assignedName = constructor.name.replace(/^HTML|Element$/g, "").replace(/[A-Z]/g, "-$&").toLowerCase().replace(/^-/, "html-");
        return assignedName;
    }
    const needsHeadRenderingSymbol = Symbol.for("astro.needsHeadRendering");
    const rendererAliases = new Map([
        [
            "solid",
            "solid-js"
        ]
    ]);
    const clientOnlyValues = new Set([
        "solid-js",
        "react",
        "preact",
        "vue",
        "svelte"
    ]);
    function guessRenderers(componentUrl) {
        const extname = componentUrl?.split(".").pop();
        switch(extname){
            case "svelte":
                return [
                    "@astrojs/svelte"
                ];
            case "vue":
                return [
                    "@astrojs/vue"
                ];
            case "jsx":
            case "tsx":
                return [
                    "@astrojs/react",
                    "@astrojs/preact",
                    "@astrojs/solid-js",
                    "@astrojs/vue (jsx)"
                ];
            case void 0:
            default:
                return [
                    "@astrojs/react",
                    "@astrojs/preact",
                    "@astrojs/solid-js",
                    "@astrojs/vue",
                    "@astrojs/svelte"
                ];
        }
    }
    function isFragmentComponent(Component) {
        return Component === Fragment;
    }
    function isHTMLComponent(Component) {
        return Component && Component["astro:html"] === true;
    }
    const ASTRO_SLOT_EXP = /<\/?astro-slot\b[^>]*>/g;
    const ASTRO_STATIC_SLOT_EXP = /<\/?astro-static-slot\b[^>]*>/g;
    function removeStaticAstroSlot(html, supportsAstroStaticSlot = true) {
        const exp = supportsAstroStaticSlot ? ASTRO_STATIC_SLOT_EXP : ASTRO_SLOT_EXP;
        return html.replace(exp, "");
    }
    async function renderFrameworkComponent(result, displayName, Component, _props, slots = {}) {
        if (!Component && "client:only" in _props === false) {
            throw new Error(`Unable to render ${displayName} because it is ${Component}!
Did you forget to import the component or is it possible there is a typo?`);
        }
        const { renderers, clientDirectives } = result;
        const metadata = {
            astroStaticSlot: true,
            displayName
        };
        const { hydration, isPage, props, propsWithoutTransitionAttributes } = extractDirectives(_props, clientDirectives);
        let html = "";
        let attrs = void 0;
        if (hydration) {
            metadata.hydrate = hydration.directive;
            metadata.hydrateArgs = hydration.value;
            metadata.componentExport = hydration.componentExport;
            metadata.componentUrl = hydration.componentUrl;
        }
        const probableRendererNames = guessRenderers(metadata.componentUrl);
        const validRenderers = renderers.filter((r)=>r.name !== "astro:jsx");
        const { children, slotInstructions } = await renderSlots(result, slots);
        let renderer;
        if (metadata.hydrate !== "only") {
            let isTagged = false;
            try {
                isTagged = Component && Component[Renderer];
            } catch  {}
            if (isTagged) {
                const rendererName = Component[Renderer];
                renderer = renderers.find(({ name })=>name === rendererName);
            }
            if (!renderer) {
                let error;
                for (const r of renderers){
                    try {
                        if (await r.ssr.check.call({
                            result
                        }, Component, props, children, metadata)) {
                            renderer = r;
                            break;
                        }
                    } catch (e) {
                        error ??= e;
                    }
                }
                if (!renderer && error) {
                    throw error;
                }
            }
            if (!renderer && typeof HTMLElement === "function" && componentIsHTMLElement(Component)) {
                const output = await renderHTMLElement$1(result, Component, _props, slots);
                return {
                    render (destination) {
                        destination.write(output);
                    }
                };
            }
        } else {
            if (metadata.hydrateArgs) {
                const rendererName = rendererAliases.has(metadata.hydrateArgs) ? rendererAliases.get(metadata.hydrateArgs) : metadata.hydrateArgs;
                if (clientOnlyValues.has(rendererName)) {
                    renderer = renderers.find(({ name })=>name === `@astrojs/${rendererName}` || name === rendererName);
                }
            }
            if (!renderer && validRenderers.length === 1) {
                renderer = validRenderers[0];
            }
            if (!renderer) {
                const extname = metadata.componentUrl?.split(".").pop();
                renderer = renderers.find(({ name })=>name === `@astrojs/${extname}` || name === extname);
            }
            if (!renderer && metadata.hydrateArgs) {
                const rendererName = metadata.hydrateArgs;
                if (typeof rendererName === "string") {
                    renderer = renderers.find(({ name })=>name === rendererName);
                }
            }
        }
        let componentServerRenderEndTime;
        if (!renderer) {
            if (metadata.hydrate === "only") {
                const rendererName = rendererAliases.has(metadata.hydrateArgs) ? rendererAliases.get(metadata.hydrateArgs) : metadata.hydrateArgs;
                if (clientOnlyValues.has(rendererName)) {
                    const plural = validRenderers.length > 1;
                    throw new AstroError({
                        ...NoMatchingRenderer,
                        message: NoMatchingRenderer.message(metadata.displayName, metadata?.componentUrl?.split(".").pop(), plural, validRenderers.length),
                        hint: NoMatchingRenderer.hint(formatList(probableRendererNames.map((r)=>"`" + r + "`")))
                    });
                } else {
                    throw new AstroError({
                        ...NoClientOnlyHint,
                        message: NoClientOnlyHint.message(metadata.displayName),
                        hint: NoClientOnlyHint.hint(probableRendererNames.map((r)=>r.replace("@astrojs/", "")).join("|"))
                    });
                }
            } else if (typeof Component !== "string") {
                const matchingRenderers = validRenderers.filter((r)=>probableRendererNames.includes(r.name));
                const plural = validRenderers.length > 1;
                if (matchingRenderers.length === 0) {
                    throw new AstroError({
                        ...NoMatchingRenderer,
                        message: NoMatchingRenderer.message(metadata.displayName, metadata?.componentUrl?.split(".").pop(), plural, validRenderers.length),
                        hint: NoMatchingRenderer.hint(formatList(probableRendererNames.map((r)=>"`" + r + "`")))
                    });
                } else if (matchingRenderers.length === 1) {
                    renderer = matchingRenderers[0];
                    ({ html, attrs } = await renderer.ssr.renderToStaticMarkup.call({
                        result
                    }, Component, propsWithoutTransitionAttributes, children, metadata));
                } else {
                    throw new Error(`Unable to render ${metadata.displayName}!

This component likely uses ${formatList(probableRendererNames)},
but Astro encountered an error during server-side rendering.

Please ensure that ${metadata.displayName}:
1. Does not unconditionally access browser-specific globals like \`window\` or \`document\`.
   If this is unavoidable, use the \`client:only\` hydration directive.
2. Does not conditionally return \`null\` or \`undefined\` when rendered on the server.
3. If using multiple JSX frameworks at the same time (e.g. React + Preact), pass the correct \`include\`/\`exclude\` options to integrations.

If you're still stuck, please open an issue on GitHub or join us at https://astro.build/chat.`);
                }
            }
        } else {
            if (metadata.hydrate === "only") {
                html = await renderSlotToString(result, slots?.fallback);
            } else {
                const componentRenderStartTime = performance.now();
                ({ html, attrs } = await renderer.ssr.renderToStaticMarkup.call({
                    result
                }, Component, propsWithoutTransitionAttributes, children, metadata));
                if (process.env.NODE_ENV === "development") componentServerRenderEndTime = performance.now() - componentRenderStartTime;
            }
        }
        if (!html && typeof Component === "string") {
            const Tag = sanitizeElementName(Component);
            const childSlots = Object.values(children).join("");
            const renderTemplateResult = renderTemplate`<${Tag}${internalSpreadAttributes(props, true, Tag)}${markHTMLString(childSlots === "" && voidElementNames.test(Tag) ? `/>` : `>${childSlots}</${Tag}>`)}`;
            html = "";
            const destination = {
                write (chunk) {
                    if (chunk instanceof Response) return;
                    html += chunkToString(result, chunk);
                }
            };
            await renderTemplateResult.render(destination);
        }
        if (!hydration) {
            return {
                render (destination) {
                    if (slotInstructions) {
                        for (const instruction of slotInstructions){
                            destination.write(instruction);
                        }
                    }
                    if (isPage || renderer?.name === "astro:jsx") {
                        destination.write(html);
                    } else if (html && html.length > 0) {
                        destination.write(markHTMLString(removeStaticAstroSlot(html, renderer?.ssr?.supportsAstroStaticSlot)));
                    }
                }
            };
        }
        const astroId = shorthash(`<!--${metadata.componentExport.value}:${metadata.componentUrl}-->
${html}
${serializeProps(props, metadata)}`);
        const island = await generateHydrateScript({
            renderer,
            result,
            astroId,
            props,
            attrs
        }, metadata);
        if (componentServerRenderEndTime && process.env.NODE_ENV === "development") island.props["server-render-time"] = componentServerRenderEndTime;
        let unrenderedSlots = [];
        if (html) {
            if (Object.keys(children).length > 0) {
                for (const key of Object.keys(children)){
                    let tagName = renderer?.ssr?.supportsAstroStaticSlot ? !!metadata.hydrate ? "astro-slot" : "astro-static-slot" : "astro-slot";
                    let expectedHTML = key === "default" ? `<${tagName}>` : `<${tagName} name="${escapeHTML(key)}">`;
                    if (!html.includes(expectedHTML)) {
                        unrenderedSlots.push(key);
                    }
                }
            }
        } else {
            unrenderedSlots = Object.keys(children);
        }
        const template = unrenderedSlots.length > 0 ? unrenderedSlots.map((key)=>`<template data-astro-template${key !== "default" ? `="${escapeHTML(key)}"` : ""}>${children[key]}</template>`).join("") : "";
        island.children = `${html ?? ""}${template}`;
        if (island.children) {
            island.props["await-children"] = "";
            island.children += `<!--astro:end-->`;
        }
        return {
            render (destination) {
                if (slotInstructions) {
                    for (const instruction of slotInstructions){
                        destination.write(instruction);
                    }
                }
                destination.write(createRenderInstruction({
                    type: "directive",
                    hydration
                }));
                if (hydration.directive !== "only" && renderer?.ssr.renderHydrationScript) {
                    destination.write(createRenderInstruction({
                        type: "renderer-hydration-script",
                        rendererName: renderer.name,
                        render: renderer.ssr.renderHydrationScript
                    }));
                }
                const renderedElement = renderElement$1("astro-island", island, false);
                destination.write(markHTMLString(renderedElement));
            }
        };
    }
    function sanitizeElementName(tag) {
        const unsafe = /[&<>'"\s]+/;
        if (!unsafe.test(tag)) return tag;
        return tag.trim().split(unsafe)[0].trim();
    }
    function renderFragmentComponent(result, slots = {}) {
        const slot = slots?.default;
        const preRendered = slot?.(result);
        return {
            render (destination) {
                if (preRendered == null) return;
                return renderChild(destination, preRendered);
            }
        };
    }
    async function renderHTMLComponent(result, Component, _props, slots = {}) {
        const { slotInstructions, children } = await renderSlots(result, slots);
        const html = Component({
            slots: children
        });
        const hydrationHtml = slotInstructions ? slotInstructions.map((instr)=>chunkToString(result, instr)).join("") : "";
        return {
            render (destination) {
                destination.write(markHTMLString(hydrationHtml + html));
            }
        };
    }
    function renderAstroComponent(result, displayName, Component, props, slots = {}) {
        if (containsServerDirective(props)) {
            const serverIslandComponent = new ServerIslandComponent(result, props, slots, displayName);
            result._metadata.propagators.add(serverIslandComponent);
            return serverIslandComponent;
        }
        const instance = createAstroComponentInstance(result, displayName, Component, props, slots);
        return {
            render (destination) {
                return instance.render(destination);
            }
        };
    }
    renderComponent = function(result, displayName, Component, props, slots = {}) {
        if (isPromise(Component)) {
            return Component.catch(handleCancellation).then((x)=>{
                return renderComponent(result, displayName, x, props, slots);
            });
        }
        if (isFragmentComponent(Component)) {
            return renderFragmentComponent(result, slots);
        }
        props = normalizeProps(props);
        if (isHTMLComponent(Component)) {
            return renderHTMLComponent(result, Component, props, slots).catch(handleCancellation);
        }
        if (isAstroComponentFactory(Component)) {
            return renderAstroComponent(result, displayName, Component, props, slots);
        }
        return renderFrameworkComponent(result, displayName, Component, props, slots).catch(handleCancellation);
        function handleCancellation(e) {
            if (result.cancelled) return {
                render () {}
            };
            throw e;
        }
    };
    function normalizeProps(props) {
        if (props["class:list"] !== void 0) {
            const value = props["class:list"];
            delete props["class:list"];
            props["class"] = clsx(props["class"], value);
            if (props["class"] === "") {
                delete props["class"];
            }
        }
        return props;
    }
    async function renderComponentToString(result, displayName, Component, props, slots = {}, isPage = false, route) {
        let str = "";
        let renderedFirstPageChunk = false;
        let head = "";
        if (isPage && !result.partial && nonAstroPageNeedsHeadInjection(Component)) {
            head += chunkToString(result, maybeRenderHead());
        }
        try {
            const destination = {
                write (chunk) {
                    if (isPage && !result.partial && !renderedFirstPageChunk) {
                        renderedFirstPageChunk = true;
                        if (!/<!doctype html/i.test(String(chunk))) {
                            const doctype = result.compressHTML ? "<!DOCTYPE html>" : "<!DOCTYPE html>\n";
                            str += doctype + head;
                        }
                    }
                    if (chunk instanceof Response) return;
                    str += chunkToString(result, chunk);
                }
            };
            const renderInstance = await renderComponent(result, displayName, Component, props, slots);
            if (containsServerDirective(props)) {
                await bufferHeadContent(result);
            }
            await renderInstance.render(destination);
        } catch (e) {
            if (AstroError.is(e) && !e.loc) {
                e.setLocation({
                    file: route?.component
                });
            }
            throw e;
        }
        return str;
    }
    function nonAstroPageNeedsHeadInjection(pageComponent) {
        return !!pageComponent?.[needsHeadRenderingSymbol];
    }
    const ClientOnlyPlaceholder$1 = "astro-client-only";
    const hasTriedRenderComponentSymbol = Symbol("hasTriedRenderComponent");
    async function renderJSX(result, vnode) {
        switch(true){
            case vnode instanceof HTMLString:
                if (vnode.toString().trim() === "") {
                    return "";
                }
                return vnode;
            case typeof vnode === "string":
                return markHTMLString(escapeHTML(vnode));
            case typeof vnode === "function":
                return vnode;
            case (!vnode && vnode !== 0):
                return "";
            case Array.isArray(vnode):
                {
                    const renderedItems = await Promise.all(vnode.map((v)=>renderJSX(result, v)));
                    let instructions = null;
                    let content = "";
                    for (const item of renderedItems){
                        if (item instanceof SlotString) {
                            content += item;
                            instructions = mergeSlotInstructions(instructions, item);
                        } else {
                            content += item;
                        }
                    }
                    if (instructions) {
                        return markHTMLString(new SlotString(content, instructions));
                    }
                    return markHTMLString(content);
                }
        }
        return renderJSXVNode(result, vnode);
    }
    async function renderJSXVNode(result, vnode) {
        if (isVNode(vnode)) {
            switch(true){
                case !vnode.type:
                    {
                        throw new Error(`Unable to render ${result.pathname} because it contains an undefined Component!
Did you forget to import the component or is it possible there is a typo?`);
                    }
                case vnode.type === Symbol.for("astro:fragment"):
                    return renderJSX(result, vnode.props.children);
                case isAstroComponentFactory(vnode.type):
                    {
                        let props = {};
                        let slots = {};
                        for (const [key, value] of Object.entries(vnode.props ?? {})){
                            if (key === "children" || value && typeof value === "object" && value["$$slot"]) {
                                slots[key === "children" ? "default" : key] = ()=>renderJSX(result, value);
                            } else {
                                props[key] = value;
                            }
                        }
                        const str = await renderComponentToString(result, vnode.type.name, vnode.type, props, slots);
                        const html = markHTMLString(str);
                        return html;
                    }
                case (!vnode.type && vnode.type !== 0):
                    return "";
                case (typeof vnode.type === "string" && vnode.type !== ClientOnlyPlaceholder$1 && !vnode.type.includes("-")):
                    return markHTMLString(await renderElement(result, vnode.type, vnode.props ?? {}));
            }
            if (vnode.type) {
                let extractSlots2 = function(child) {
                    if (Array.isArray(child)) {
                        return child.map((c)=>extractSlots2(c));
                    }
                    if (!isVNode(child)) {
                        _slots.default.push(child);
                        return;
                    }
                    if ("slot" in child.props) {
                        _slots[child.props.slot] = [
                            ..._slots[child.props.slot] ?? [],
                            child
                        ];
                        delete child.props.slot;
                        return;
                    }
                    _slots.default.push(child);
                };
                if (typeof vnode.type === "function" && vnode.props["server:root"]) {
                    const output2 = await vnode.type(vnode.props ?? {});
                    return await renderJSX(result, output2);
                }
                if (typeof vnode.type === "function") {
                    if (vnode.props[hasTriedRenderComponentSymbol]) {
                        delete vnode.props[hasTriedRenderComponentSymbol];
                        const output2 = await vnode.type(vnode.props ?? {});
                        if (output2?.[AstroJSX] || !output2) {
                            return await renderJSXVNode(result, output2);
                        } else {
                            return;
                        }
                    } else {
                        vnode.props[hasTriedRenderComponentSymbol] = true;
                    }
                }
                const { children = null, ...props } = vnode.props ?? {};
                const _slots = {
                    default: []
                };
                extractSlots2(children);
                for (const [key, value] of Object.entries(props)){
                    if (value?.["$$slot"]) {
                        _slots[key] = value;
                        delete props[key];
                    }
                }
                const slotPromises = [];
                const slots = {};
                for (const [key, value] of Object.entries(_slots)){
                    slotPromises.push(renderJSX(result, value).then((output2)=>{
                        if (output2.toString().trim().length === 0) return;
                        slots[key] = ()=>output2;
                    }));
                }
                await Promise.all(slotPromises);
                let output;
                if (vnode.type === ClientOnlyPlaceholder$1 && vnode.props["client:only"]) {
                    output = await renderComponentToString(result, vnode.props["client:display-name"] ?? "", null, props, slots);
                } else {
                    output = await renderComponentToString(result, typeof vnode.type === "function" ? vnode.type.name : vnode.type, vnode.type, props, slots);
                }
                return markHTMLString(output);
            }
        }
        return markHTMLString(`${vnode}`);
    }
    async function renderElement(result, tag, { children, ...props }) {
        return markHTMLString(`<${tag}${spreadAttributes(props)}${markHTMLString((children == null || children === "") && voidElementNames.test(tag) ? `/>` : `>${children == null ? "" : await renderJSX(result, prerenderElementChildren$1(tag, children))}</${tag}>`)}`);
    }
    function prerenderElementChildren$1(tag, children) {
        if (typeof children === "string" && (tag === "style" || tag === "script")) {
            return markHTMLString(children);
        } else {
            return children;
        }
    }
    const ClientOnlyPlaceholder = "astro-client-only";
    function renderJSXToQueue(vnode, result, queue, pool, stack, parent, metadata) {
        if (vnode instanceof HTMLString) {
            const html = vnode.toString();
            if (html.trim() === "") return;
            const node = pool.acquire("html-string", html);
            node.html = html;
            queue.nodes.push(node);
            return;
        }
        if (typeof vnode === "string") {
            const node = pool.acquire("text", vnode);
            node.content = vnode;
            queue.nodes.push(node);
            return;
        }
        if (typeof vnode === "number" || typeof vnode === "boolean") {
            const str = String(vnode);
            const node = pool.acquire("text", str);
            node.content = str;
            queue.nodes.push(node);
            return;
        }
        if (vnode == null || vnode === false) {
            return;
        }
        if (Array.isArray(vnode)) {
            for(let i = vnode.length - 1; i >= 0; i = i - 1){
                stack.push({
                    node: vnode[i],
                    parent,
                    metadata
                });
            }
            return;
        }
        if (!isVNode(vnode)) {
            const str = String(vnode);
            const node = pool.acquire("text", str);
            node.content = str;
            queue.nodes.push(node);
            return;
        }
        handleVNode(vnode, result, queue, pool, stack, parent, metadata);
    }
    function handleVNode(vnode, result, queue, pool, stack, parent, metadata) {
        if (!vnode.type) {
            throw new Error(`Unable to render ${result.pathname} because it contains an undefined Component!
Did you forget to import the component or is it possible there is a typo?`);
        }
        if (vnode.type === Symbol.for("astro:fragment")) {
            stack.push({
                node: vnode.props?.children,
                parent,
                metadata
            });
            return;
        }
        if (isAstroComponentFactory(vnode.type)) {
            const factory = vnode.type;
            let props = {};
            let slots = {};
            for (const [key, value] of Object.entries(vnode.props ?? {})){
                if (key === "children" || value && typeof value === "object" && value["$$slot"]) {
                    slots[key === "children" ? "default" : key] = ()=>renderJSX(result, value);
                } else {
                    props[key] = value;
                }
            }
            const displayName = metadata?.displayName || factory.name || "Anonymous";
            const instance = createAstroComponentInstance(result, displayName, factory, props, slots);
            const queueNode = pool.acquire("component");
            queueNode.instance = instance;
            queue.nodes.push(queueNode);
            return;
        }
        if (typeof vnode.type === "string" && vnode.type !== ClientOnlyPlaceholder) {
            renderHTMLElement(vnode, result, queue, pool, stack, parent, metadata);
            return;
        }
        if (typeof vnode.type === "function") {
            if (vnode.props?.["server:root"]) {
                const output3 = vnode.type(vnode.props ?? {});
                stack.push({
                    node: output3,
                    parent,
                    metadata
                });
                return;
            }
            const output2 = vnode.type(vnode.props ?? {});
            stack.push({
                node: output2,
                parent,
                metadata
            });
            return;
        }
        const output = renderJSX(result, vnode);
        stack.push({
            node: output,
            parent,
            metadata
        });
    }
    function renderHTMLElement(vnode, _result, queue, pool, stack, parent, metadata) {
        const tag = vnode.type;
        const { children, ...props } = vnode.props ?? {};
        const attrs = spreadAttributes(props);
        const isVoidElement = (children == null || children === "") && voidElementNames.test(tag);
        if (isVoidElement) {
            const html = `<${tag}${attrs}/>`;
            const node = pool.acquire("html-string", html);
            node.html = html;
            queue.nodes.push(node);
            return;
        }
        const openTag = `<${tag}${attrs}>`;
        const openTagHtml = queue.htmlStringCache ? queue.htmlStringCache.getOrCreate(openTag) : markHTMLString(openTag);
        stack.push({
            node: openTagHtml,
            parent,
            metadata
        });
        if (children != null && children !== "") {
            const processedChildren = prerenderElementChildren(tag, children, queue.htmlStringCache);
            stack.push({
                node: processedChildren,
                parent,
                metadata
            });
        }
        const closeTag = `</${tag}>`;
        const closeTagHtml = queue.htmlStringCache ? queue.htmlStringCache.getOrCreate(closeTag) : markHTMLString(closeTag);
        stack.push({
            node: closeTagHtml,
            parent,
            metadata
        });
    }
    function prerenderElementChildren(tag, children, htmlStringCache) {
        if (typeof children === "string" && (tag === "style" || tag === "script")) {
            return htmlStringCache ? htmlStringCache.getOrCreate(children) : markHTMLString(children);
        }
        return children;
    }
    async function buildRenderQueue(root, result, pool) {
        const queue = {
            nodes: [],
            result,
            pool,
            htmlStringCache: result._experimentalQueuedRendering?.htmlStringCache
        };
        const stack = [
            {
                node: root,
                parent: null
            }
        ];
        while(stack.length > 0){
            const item = stack.pop();
            if (!item) {
                continue;
            }
            let { node, parent } = item;
            if (isPromise(node)) {
                try {
                    const resolved = await node;
                    stack.push({
                        node: resolved,
                        parent,
                        metadata: item.metadata
                    });
                } catch (error) {
                    throw error;
                }
                continue;
            }
            if (node == null || node === false) {
                continue;
            }
            if (typeof node === "string") {
                const queueNode = pool.acquire("text", node);
                queueNode.content = node;
                queue.nodes.push(queueNode);
                continue;
            }
            if (typeof node === "number" || typeof node === "boolean") {
                const str = String(node);
                const queueNode = pool.acquire("text", str);
                queueNode.content = str;
                queue.nodes.push(queueNode);
                continue;
            }
            if (isHTMLString(node)) {
                const html = node.toString();
                const queueNode = pool.acquire("html-string", html);
                queueNode.html = html;
                queue.nodes.push(queueNode);
                continue;
            }
            if (node instanceof SlotString) {
                const html = node.toString();
                const queueNode = pool.acquire("html-string", html);
                queueNode.html = html;
                queue.nodes.push(queueNode);
                continue;
            }
            if (isVNode(node)) {
                renderJSXToQueue(node, result, queue, pool, stack, parent, item.metadata);
                continue;
            }
            if (Array.isArray(node)) {
                for (const n of node){
                    stack.push({
                        node: n,
                        parent,
                        metadata: item.metadata
                    });
                }
                continue;
            }
            if (isRenderInstruction(node)) {
                const queueNode = pool.acquire("instruction");
                queueNode.instruction = node;
                queue.nodes.push(queueNode);
                continue;
            }
            if (isRenderTemplateResult(node)) {
                const htmlParts = node["htmlParts"];
                const expressions = node["expressions"];
                if (htmlParts[0]) {
                    const htmlString = queue.htmlStringCache ? queue.htmlStringCache.getOrCreate(htmlParts[0]) : markHTMLString(htmlParts[0]);
                    stack.push({
                        node: htmlString,
                        parent,
                        metadata: item.metadata
                    });
                }
                for(let i = 0; i < expressions.length; i = i + 1){
                    stack.push({
                        node: expressions[i],
                        parent,
                        metadata: item.metadata
                    });
                    if (htmlParts[i + 1]) {
                        const htmlString = queue.htmlStringCache ? queue.htmlStringCache.getOrCreate(htmlParts[i + 1]) : markHTMLString(htmlParts[i + 1]);
                        stack.push({
                            node: htmlString,
                            parent,
                            metadata: item.metadata
                        });
                    }
                }
                continue;
            }
            if (isAstroComponentInstance(node)) {
                const queueNode = pool.acquire("component");
                queueNode.instance = node;
                queue.nodes.push(queueNode);
                continue;
            }
            if (isAstroComponentFactory(node)) {
                const factory = node;
                const props = item.metadata?.props || {};
                const slots = item.metadata?.slots || {};
                const displayName = item.metadata?.displayName || factory.name || "Anonymous";
                const instance = createAstroComponentInstance(result, displayName, factory, props, slots);
                const queueNode = pool.acquire("component");
                queueNode.instance = instance;
                if (isAPropagatingComponent(result, factory)) {
                    try {
                        const returnValue = await instance.init(result);
                        if (isHeadAndContent(returnValue) && returnValue.head) {
                            result._metadata.extraHead.push(returnValue.head);
                        }
                    } catch (error) {
                        throw error;
                    }
                }
                queue.nodes.push(queueNode);
                continue;
            }
            if (isRenderInstance(node)) {
                const queueNode = pool.acquire("component");
                queueNode.instance = node;
                queue.nodes.push(queueNode);
                continue;
            }
            if (typeof node === "object" && Symbol.iterator in node) {
                const items = Array.from(node);
                for (const iterItem of items){
                    stack.push({
                        node: iterItem,
                        parent,
                        metadata: item.metadata
                    });
                }
                continue;
            }
            if (typeof node === "object" && Symbol.asyncIterator in node) {
                try {
                    const items = [];
                    for await (const asyncItem of node){
                        items.push(asyncItem);
                    }
                    for (const iterItem of items){
                        stack.push({
                            node: iterItem,
                            parent,
                            metadata: item.metadata
                        });
                    }
                } catch (error) {
                    throw error;
                }
                continue;
            }
            if (node instanceof Response) {
                const queueNode = pool.acquire("html-string", "");
                queueNode.html = "";
                queue.nodes.push(queueNode);
                continue;
            }
            if (isHTMLString(node)) {
                const html = String(node);
                const queueNode = pool.acquire("html-string", html);
                queueNode.html = html;
                queue.nodes.push(queueNode);
            } else {
                const str = String(node);
                const queueNode = pool.acquire("text", str);
                queueNode.content = str;
                queue.nodes.push(queueNode);
            }
        }
        queue.nodes.reverse();
        return queue;
    }
    async function renderQueue(queue, destination) {
        const result = queue.result;
        const pool = queue.pool;
        const cache = queue.htmlStringCache;
        let batchBuffer = "";
        let i = 0;
        while(i < queue.nodes.length){
            const node = queue.nodes[i];
            try {
                if (canBatch(node)) {
                    const batchStart = i;
                    while(i < queue.nodes.length && canBatch(queue.nodes[i])){
                        batchBuffer += renderNodeToString(queue.nodes[i]);
                        i = i + 1;
                    }
                    if (batchBuffer) {
                        const htmlString = cache ? cache.getOrCreate(batchBuffer) : markHTMLString(batchBuffer);
                        destination.write(htmlString);
                        batchBuffer = "";
                    }
                    if (pool) {
                        for(let j = batchStart; j < i; j++){
                            pool.release(queue.nodes[j]);
                        }
                    }
                } else {
                    await renderNode(node, destination, result);
                    if (pool) {
                        pool.release(node);
                    }
                    i = i + 1;
                }
            } catch (error) {
                throw error;
            }
        }
        if (batchBuffer) {
            const htmlString = cache ? cache.getOrCreate(batchBuffer) : markHTMLString(batchBuffer);
            destination.write(htmlString);
        }
    }
    function canBatch(node) {
        return node.type === "text" || node.type === "html-string";
    }
    function renderNodeToString(node) {
        switch(node.type){
            case "text":
                return node.content ? escapeHTML(node.content) : "";
            case "html-string":
                return node.html || "";
            case "component":
            case "instruction":
                {
                    return "";
                }
        }
    }
    async function renderNode(node, destination, result) {
        const cache = result._experimentalQueuedRendering?.htmlStringCache;
        switch(node.type){
            case "text":
                {
                    if (node.content) {
                        const escaped = escapeHTML(node.content);
                        const htmlString = cache ? cache.getOrCreate(escaped) : markHTMLString(escaped);
                        destination.write(htmlString);
                    }
                    break;
                }
            case "html-string":
                {
                    if (node.html) {
                        const htmlString = cache ? cache.getOrCreate(node.html) : markHTMLString(node.html);
                        destination.write(htmlString);
                    }
                    break;
                }
            case "instruction":
                {
                    if (node.instruction) {
                        destination.write(node.instruction);
                    }
                    break;
                }
            case "component":
                {
                    if (node.instance) {
                        let componentHtml = "";
                        const componentDestination = {
                            write (chunk) {
                                if (chunk instanceof Response) return;
                                componentHtml += chunkToString(result, chunk);
                            }
                        };
                        await node.instance.render(componentDestination);
                        if (componentHtml) {
                            destination.write(componentHtml);
                        }
                    }
                    break;
                }
        }
    }
    async function renderPage(result, componentFactory, props, children, streaming, route) {
        if (!isAstroComponentFactory(componentFactory)) {
            result._metadata.headInTree = result.componentMetadata.get(componentFactory.moduleId)?.containsHead ?? false;
            const pageProps = {
                ...props ?? {},
                "server:root": true
            };
            let str;
            if (result._experimentalQueuedRendering && result._experimentalQueuedRendering.enabled) {
                let vnode = await componentFactory(pageProps);
                if (componentFactory["astro:html"] && typeof vnode === "string") {
                    vnode = markHTMLString(vnode);
                }
                const queue = await buildRenderQueue(vnode, result, result._experimentalQueuedRendering.pool);
                let html = "";
                let renderedFirst = false;
                const destination = {
                    write (chunk) {
                        if (chunk instanceof Response) return;
                        if (!renderedFirst && !result.partial) {
                            renderedFirst = true;
                            const chunkStr = String(chunk);
                            if (!/<!doctype html/i.test(chunkStr)) {
                                const doctype = result.compressHTML ? "<!DOCTYPE html>" : "<!DOCTYPE html>\n";
                                html += doctype;
                            }
                        }
                        html += chunkToString(result, chunk);
                    }
                };
                await renderQueue(queue, destination);
                str = html;
            } else {
                str = await renderComponentToString(result, componentFactory.name, componentFactory, pageProps, {}, true, route);
            }
            const bytes = encoder.encode(str);
            const headers2 = new Headers([
                [
                    "Content-Type",
                    "text/html"
                ],
                [
                    "Content-Length",
                    bytes.byteLength.toString()
                ]
            ]);
            if (result.shouldInjectCspMetaTags && (result.cspDestination === "header" || result.cspDestination === "adapter")) {
                headers2.set("content-security-policy", renderCspContent(result));
            }
            return new Response(bytes, {
                headers: headers2,
                status: result.response.status
            });
        }
        result._metadata.headInTree = result.componentMetadata.get(componentFactory.moduleId)?.containsHead ?? false;
        let body;
        if (streaming) {
            if (isNode && !isDeno) {
                const nodeBody = await renderToAsyncIterable(result, componentFactory, props, children, true, route);
                body = nodeBody;
            } else {
                body = await renderToReadableStream(result, componentFactory, props, children, true, route);
            }
        } else {
            body = await renderToString(result, componentFactory, props, children, true, route);
        }
        if (body instanceof Response) return body;
        const init = result.response;
        const headers = new Headers(init.headers);
        if (result.shouldInjectCspMetaTags && result.cspDestination === "header" || result.cspDestination === "adapter") {
            headers.set("content-security-policy", renderCspContent(result));
        }
        if (!streaming && typeof body === "string") {
            body = encoder.encode(body);
            headers.set("Content-Length", body.byteLength.toString());
        }
        let status = init.status;
        let statusText = init.statusText;
        if (route?.route === "/404") {
            status = 404;
            if (statusText === "OK") {
                statusText = "Not Found";
            }
        } else if (route?.route === "/500") {
            status = 500;
            if (statusText === "OK") {
                statusText = "Internal Server Error";
            }
        }
        if (status) {
            return new Response(body, {
                ...init,
                headers,
                status,
                statusText
            });
        } else {
            return new Response(body, {
                ...init,
                headers
            });
        }
    }
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_".split("").reduce((v, c)=>(v[c.charCodeAt(0)] = c, v), []);
    "-0123456789_".split("").reduce((v, c)=>(v[c.charCodeAt(0)] = c, v), []);
    spreadAttributes = function(values = {}, _name, { class: scopedClassName } = {}) {
        let output = "";
        if (scopedClassName) {
            if (typeof values.class !== "undefined") {
                values.class += ` ${scopedClassName}`;
            } else if (typeof values["class:list"] !== "undefined") {
                values["class:list"] = [
                    values["class:list"],
                    scopedClassName
                ];
            } else {
                values.class = scopedClassName;
            }
        }
        for (const [key, value] of Object.entries(values)){
            output += addAttribute(value, key, true, _name);
        }
        return markHTMLString(output);
    };
    function getPattern(segments, base, addTrailingSlash) {
        const pathname = segments.map((segment)=>{
            if (segment.length === 1 && segment[0].spread) {
                return "(?:\\/(.*?))?";
            } else {
                return "\\/" + segment.map((part)=>{
                    if (part.spread) {
                        return "(.*?)";
                    } else if (part.dynamic) {
                        return "([^/]+?)";
                    } else {
                        return part.content.normalize().replace(/\?/g, "%3F").replace(/#/g, "%23").replace(/%5B/g, "[").replace(/%5D/g, "]").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    }
                }).join("");
            }
        }).join("");
        const trailing = addTrailingSlash && segments.length ? getTrailingSlashPattern(addTrailingSlash) : "$";
        let initial = "\\/";
        if (addTrailingSlash === "never" && base !== "/" && pathname !== "") {
            initial = "";
        }
        return new RegExp(`^${pathname || initial}${trailing}`);
    }
    function getTrailingSlashPattern(addTrailingSlash) {
        if (addTrailingSlash === "always") {
            return "\\/$";
        }
        if (addTrailingSlash === "never") {
            return "$";
        }
        return "\\/?$";
    }
    const SERVER_ISLAND_ROUTE = "/_server-islands/[name]";
    const SERVER_ISLAND_COMPONENT = "_server-islands.astro";
    function badRequest(reason) {
        return new Response(null, {
            status: 400,
            statusText: "Bad request: " + reason
        });
    }
    const DEFAULT_BODY_SIZE_LIMIT = 1024 * 1024;
    async function getRequestData(request, bodySizeLimit = DEFAULT_BODY_SIZE_LIMIT) {
        switch(request.method){
            case "GET":
                {
                    const url = new URL(request.url);
                    const params = url.searchParams;
                    if (!params.has("s") || !params.has("e") || !params.has("p")) {
                        return badRequest("Missing required query parameters.");
                    }
                    const encryptedSlots = params.get("s");
                    return {
                        encryptedComponentExport: params.get("e"),
                        encryptedProps: params.get("p"),
                        encryptedSlots
                    };
                }
            case "POST":
                {
                    try {
                        const body = await readBodyWithLimit(request, bodySizeLimit);
                        const raw = new TextDecoder().decode(body);
                        const data = JSON.parse(raw);
                        if (Object.hasOwn(data, "slots") && typeof data.slots === "object") {
                            return badRequest("Plaintext slots are not allowed. Slots must be encrypted.");
                        }
                        if (Object.hasOwn(data, "componentExport") && typeof data.componentExport === "string") {
                            return badRequest("Plaintext componentExport is not allowed. componentExport must be encrypted.");
                        }
                        return data;
                    } catch (e) {
                        if (e instanceof BodySizeLimitError) {
                            return new Response(null, {
                                status: 413,
                                statusText: e.message
                            });
                        }
                        if (e instanceof SyntaxError) {
                            return badRequest("Request format is invalid.");
                        }
                        throw e;
                    }
                }
            default:
                {
                    return new Response(null, {
                        status: 405
                    });
                }
        }
    }
    function createEndpoint(manifest) {
        const page = async (result)=>{
            const params = result.params;
            if (!params.name) {
                return new Response(null, {
                    status: 400,
                    statusText: "Bad request"
                });
            }
            const componentId = params.name;
            const data = await getRequestData(result.request, manifest.serverIslandBodySizeLimit);
            if (data instanceof Response) {
                return data;
            }
            const serverIslandMappings = await manifest.serverIslandMappings?.();
            const serverIslandMap = await serverIslandMappings?.serverIslandMap;
            let imp = serverIslandMap?.get(componentId);
            if (!imp) {
                return new Response(null, {
                    status: 404,
                    statusText: "Not found"
                });
            }
            const key = await manifest.key;
            let componentExport;
            try {
                componentExport = await decryptString(key, data.encryptedComponentExport, `export:${componentId}`);
            } catch (_e) {
                return badRequest("Encrypted componentExport value is invalid.");
            }
            const encryptedProps = data.encryptedProps;
            let props = {};
            if (encryptedProps !== "") {
                try {
                    const propString = await decryptString(key, encryptedProps, `props:${componentId}`);
                    props = JSON.parse(propString);
                } catch (_e) {
                    return badRequest("Encrypted props value is invalid.");
                }
            }
            let decryptedSlots = {};
            const encryptedSlots = data.encryptedSlots;
            if (encryptedSlots !== "") {
                try {
                    const slotsString = await decryptString(key, encryptedSlots, `slots:${componentId}`);
                    decryptedSlots = JSON.parse(slotsString);
                } catch (_e) {
                    return badRequest("Encrypted slots value is invalid.");
                }
            }
            const componentModule = await imp();
            let Component = componentModule[componentExport];
            const slots = {};
            for(const prop in decryptedSlots){
                slots[prop] = createSlotValueFromString(decryptedSlots[prop]);
            }
            result.response.headers.set("X-Robots-Tag", "noindex");
            if (isAstroComponentFactory(Component)) {
                const ServerIsland = Component;
                Component = function(...args) {
                    return ServerIsland.apply(this, args);
                };
                Object.assign(Component, ServerIsland);
                Component.propagation = "self";
            }
            return renderTemplate`${renderComponent(result, "Component", Component, props, slots)}`;
        };
        page.isAstroComponentFactory = true;
        const instance = {
            default: page,
            partial: true
        };
        return instance;
    }
    function createDefaultRoutes(manifest) {
        const root = new URL(manifest.rootDir);
        return [
            {
                instance: default404Instance,
                matchesComponent: (filePath)=>filePath.href === new URL(DEFAULT_404_COMPONENT, root).href,
                route: DEFAULT_404_ROUTE.route,
                component: DEFAULT_404_COMPONENT
            },
            {
                instance: createEndpoint(manifest),
                matchesComponent: (filePath)=>filePath.href === new URL(SERVER_ISLAND_COMPONENT, root).href,
                route: SERVER_ISLAND_ROUTE,
                component: SERVER_ISLAND_COMPONENT
            }
        ];
    }
    function ensure404Route(manifest) {
        if (!manifest.routes.some((route)=>route.route === "/404")) {
            manifest.routes.push(DEFAULT_404_ROUTE);
        }
        return manifest;
    }
    function routeIsRedirect(route) {
        return route?.type === "redirect";
    }
    function routeIsFallback(route) {
        return route?.type === "fallback";
    }
    function getFallbackRoute(route, routeList) {
        const fallbackRoute = routeList.find((r)=>{
            if (route.route === "/" && r.routeData.route === "/") {
                return true;
            }
            return r.routeData.fallbackRoutes.find((f)=>{
                return f.route === route.route;
            });
        });
        if (!fallbackRoute) {
            throw new Error(`No fallback route found for route ${route.route}`);
        }
        return fallbackRoute.routeData;
    }
    function getCustom404Route(manifestData) {
        return manifestData.routes.find((r)=>isRoute404(r.route));
    }
    function routeHasHtmlExtension(route) {
        return route.segments.some((segment)=>segment.some((part)=>!part.dynamic && part.content.includes(".html")));
    }
    async function getProps(opts) {
        const { logger, mod, routeData: route, routeCache, pathname, serverLike, base, trailingSlash } = opts;
        if (!route || route.pathname) {
            return {};
        }
        if (routeIsRedirect(route) || routeIsFallback(route) || route.component === DEFAULT_404_COMPONENT) {
            return {};
        }
        const staticPaths = await callGetStaticPaths({
            mod,
            route,
            routeCache,
            ssr: serverLike,
            base,
            trailingSlash
        });
        const params = getParams(route, pathname);
        const matchedStaticPath = findPathItemByKey(staticPaths, params, route, logger, trailingSlash);
        if (!matchedStaticPath && route.origin !== "internal" && (serverLike ? route.prerender : true)) {
            throw new AstroError({
                ...NoMatchingStaticPathFound,
                message: NoMatchingStaticPathFound.message(pathname),
                hint: NoMatchingStaticPathFound.hint([
                    route.component
                ])
            });
        }
        if (mod) {
            validatePrerenderEndpointCollision(route, mod, params);
        }
        const props = matchedStaticPath?.props ? {
            ...matchedStaticPath.props
        } : {};
        return props;
    }
    function getParams(route, pathname) {
        if (!route.params.length) return {};
        const path = pathname.endsWith(".html") && route.type === "page" && !routeHasHtmlExtension(route) ? pathname.slice(0, -5) : pathname;
        const allPatterns = [
            route,
            ...route.fallbackRoutes
        ].map((r)=>r.pattern);
        const paramsMatch = allPatterns.map((pattern)=>pattern.exec(path)).find((x)=>x);
        if (!paramsMatch) return {};
        const params = {};
        route.params.forEach((key, i)=>{
            if (key.startsWith("...")) {
                params[key.slice(3)] = paramsMatch[i + 1] ? paramsMatch[i + 1] : void 0;
            } else {
                params[key] = paramsMatch[i + 1];
            }
        });
        return params;
    }
    function validatePrerenderEndpointCollision(route, mod, params) {
        if (route.type === "endpoint" && mod.getStaticPaths) {
            const lastSegment = route.segments[route.segments.length - 1];
            const paramValues = Object.values(params);
            const lastParam = paramValues[paramValues.length - 1];
            if (lastSegment.length === 1 && lastSegment[0].dynamic && lastParam === void 0) {
                throw new AstroError({
                    ...PrerenderDynamicEndpointPathCollide,
                    message: PrerenderDynamicEndpointPathCollide.message(route.route),
                    hint: PrerenderDynamicEndpointPathCollide.hint(route.component),
                    location: {
                        file: route.component
                    }
                });
            }
        }
    }
    function routeComparator(a, b) {
        const commonLength = Math.min(a.segments.length, b.segments.length);
        for(let index = 0; index < commonLength; index++){
            const aSegment = a.segments[index];
            const bSegment = b.segments[index];
            const aIsStatic = aSegment.every((part)=>!part.dynamic && !part.spread);
            const bIsStatic = bSegment.every((part)=>!part.dynamic && !part.spread);
            if (aIsStatic && bIsStatic) {
                const aContent = aSegment.map((part)=>part.content).join("");
                const bContent = bSegment.map((part)=>part.content).join("");
                if (aContent !== bContent) {
                    return aContent.localeCompare(bContent);
                }
            }
            if (aIsStatic !== bIsStatic) {
                return aIsStatic ? -1 : 1;
            }
            const aAllDynamic = aSegment.every((part)=>part.dynamic);
            const bAllDynamic = bSegment.every((part)=>part.dynamic);
            if (aAllDynamic !== bAllDynamic) {
                return aAllDynamic ? 1 : -1;
            }
            const aHasSpread = aSegment.some((part)=>part.spread);
            const bHasSpread = bSegment.some((part)=>part.spread);
            if (aHasSpread !== bHasSpread) {
                return aHasSpread ? 1 : -1;
            }
        }
        const aLength = a.segments.length;
        const bLength = b.segments.length;
        if (aLength !== bLength) {
            const aEndsInRest = a.segments.at(-1)?.some((part)=>part.spread);
            const bEndsInRest = b.segments.at(-1)?.some((part)=>part.spread);
            if (aEndsInRest !== bEndsInRest && Math.abs(aLength - bLength) === 1) {
                if (aLength > bLength && aEndsInRest) {
                    return 1;
                }
                if (bLength > aLength && bEndsInRest) {
                    return -1;
                }
            }
            return aLength > bLength ? -1 : 1;
        }
        if (a.type === "endpoint" !== (b.type === "endpoint")) {
            return a.type === "endpoint" ? -1 : 1;
        }
        return a.route.localeCompare(b.route);
    }
    class Router {
        #routes;
        #base;
        #baseWithoutTrailingSlash;
        #buildFormat;
        #trailingSlash;
        constructor(routes, options){
            this.#routes = [
                ...routes
            ].sort(routeComparator);
            this.#base = normalizeBase(options.base);
            this.#baseWithoutTrailingSlash = removeTrailingForwardSlash(this.#base);
            this.#buildFormat = options.buildFormat;
            this.#trailingSlash = options.trailingSlash;
        }
        match(inputPathname, { allowWithoutBase = false } = {}) {
            const normalized = getRedirectForPathname(inputPathname);
            if (normalized.redirect) {
                return {
                    type: "redirect",
                    location: normalized.redirect,
                    status: 301
                };
            }
            if (this.#base !== "/") {
                const baseWithSlash = `${this.#baseWithoutTrailingSlash}/`;
                if (this.#trailingSlash === "always" && (normalized.pathname === this.#baseWithoutTrailingSlash || normalized.pathname === this.#base)) {
                    return {
                        type: "redirect",
                        location: baseWithSlash,
                        status: 301
                    };
                }
                if (this.#trailingSlash === "never" && normalized.pathname === baseWithSlash) {
                    return {
                        type: "redirect",
                        location: this.#baseWithoutTrailingSlash,
                        status: 301
                    };
                }
            }
            const baseResult = stripBase(normalized.pathname, this.#base, this.#baseWithoutTrailingSlash, this.#trailingSlash);
            if (!baseResult) {
                if (!allowWithoutBase) {
                    return {
                        type: "none",
                        reason: "outside-base"
                    };
                }
            }
            let pathname = baseResult ?? normalized.pathname;
            if (this.#buildFormat === "file") {
                pathname = normalizeFileFormatPathname(pathname);
            }
            const route = this.#routes.find((candidate)=>{
                if (candidate.pattern.test(pathname)) return true;
                return candidate.fallbackRoutes.some((fallbackRoute)=>fallbackRoute.pattern.test(pathname));
            });
            if (!route) {
                return {
                    type: "none",
                    reason: "no-match"
                };
            }
            const params = getParams(route, pathname);
            return {
                type: "match",
                route,
                params,
                pathname
            };
        }
        matchAll(inputPathname, { allowWithoutBase = false } = {}) {
            const normalized = getRedirectForPathname(inputPathname);
            if (normalized.redirect) {
                return [];
            }
            const baseResult = stripBase(normalized.pathname, this.#base, this.#baseWithoutTrailingSlash, this.#trailingSlash);
            if (!baseResult && !allowWithoutBase) {
                return [];
            }
            let pathname = baseResult ?? normalized.pathname;
            if (this.#buildFormat === "file") {
                pathname = normalizeFileFormatPathname(pathname);
            }
            return this.#routes.filter((candidate)=>{
                if (candidate.pattern.test(pathname)) return true;
                return candidate.fallbackRoutes.some((fallbackRoute)=>fallbackRoute.pattern.test(pathname));
            });
        }
    }
    function normalizeBase(base) {
        if (!base) return "/";
        if (base === "/") return base;
        return prependForwardSlash$1(base);
    }
    function getRedirectForPathname(pathname) {
        let value = prependForwardSlash$1(pathname);
        if (value.startsWith("//")) {
            const collapsed = `/${value.replace(/^\/+/, "")}`;
            return {
                pathname: value,
                redirect: collapsed
            };
        }
        return {
            pathname: value
        };
    }
    function stripBase(pathname, base, baseWithoutTrailingSlash, trailingSlash) {
        if (base === "/") return pathname;
        const baseWithSlash = `${baseWithoutTrailingSlash}/`;
        if (pathname === baseWithoutTrailingSlash || pathname === base) {
            return trailingSlash === "always" ? null : "/";
        }
        if (pathname === baseWithSlash) {
            return trailingSlash === "never" ? null : "/";
        }
        if (pathname.startsWith(baseWithSlash)) {
            return pathname.slice(baseWithoutTrailingSlash.length);
        }
        return null;
    }
    function normalizeFileFormatPathname(pathname) {
        if (pathname.endsWith("/index.html")) {
            const trimmed = pathname.slice(0, -"/index.html".length);
            return trimmed === "" ? "/" : trimmed;
        }
        if (pathname.endsWith(".html")) {
            const trimmed = pathname.slice(0, -".html".length);
            return trimmed === "" ? "/" : trimmed;
        }
        return pathname;
    }
    function deserializeManifest(serializedManifest, routesList) {
        const routes = [];
        if (serializedManifest.routes) {
            for (const serializedRoute of serializedManifest.routes){
                routes.push({
                    ...serializedRoute,
                    routeData: deserializeRouteData(serializedRoute.routeData)
                });
                const route = serializedRoute;
                route.routeData = deserializeRouteData(serializedRoute.routeData);
            }
        }
        const assets = new Set(serializedManifest.assets);
        const componentMetadata = new Map(serializedManifest.componentMetadata);
        const inlinedScripts = new Map(serializedManifest.inlinedScripts);
        const clientDirectives = new Map(serializedManifest.clientDirectives);
        const key = decodeKey(serializedManifest.key);
        return {
            middleware () {
                return {
                    onRequest: NOOP_MIDDLEWARE_FN
                };
            },
            ...serializedManifest,
            rootDir: new URL(serializedManifest.rootDir),
            srcDir: new URL(serializedManifest.srcDir),
            publicDir: new URL(serializedManifest.publicDir),
            outDir: new URL(serializedManifest.outDir),
            cacheDir: new URL(serializedManifest.cacheDir),
            buildClientDir: new URL(serializedManifest.buildClientDir),
            buildServerDir: new URL(serializedManifest.buildServerDir),
            assets,
            componentMetadata,
            inlinedScripts,
            clientDirectives,
            routes,
            key
        };
    }
    function deserializeRouteData(rawRouteData) {
        return {
            route: rawRouteData.route,
            type: rawRouteData.type,
            pattern: new RegExp(rawRouteData.pattern),
            params: rawRouteData.params,
            component: rawRouteData.component,
            pathname: rawRouteData.pathname || void 0,
            segments: rawRouteData.segments,
            prerender: rawRouteData.prerender,
            redirect: rawRouteData.redirect,
            redirectRoute: rawRouteData.redirectRoute ? deserializeRouteData(rawRouteData.redirectRoute) : void 0,
            fallbackRoutes: rawRouteData.fallbackRoutes.map((fallback)=>{
                return deserializeRouteData(fallback);
            }),
            isIndex: rawRouteData.isIndex,
            origin: rawRouteData.origin,
            distURL: rawRouteData.distURL
        };
    }
    function deserializeRouteInfo(rawRouteInfo) {
        return {
            styles: rawRouteInfo.styles,
            file: rawRouteInfo.file,
            links: rawRouteInfo.links,
            scripts: rawRouteInfo.scripts,
            routeData: deserializeRouteData(rawRouteInfo.routeData)
        };
    }
    class NodePool {
        textPool = [];
        htmlStringPool = [];
        componentPool = [];
        instructionPool = [];
        maxSize;
        enableStats;
        stats = {
            acquireFromPool: 0,
            acquireNew: 0,
            released: 0,
            releasedDropped: 0
        };
        constructor(maxSize = 1e3, enableStats = false){
            this.maxSize = maxSize;
            this.enableStats = enableStats;
        }
        acquire(type, content) {
            const pooledNode = this.popFromTypedPool(type);
            if (pooledNode) {
                if (this.enableStats) {
                    this.stats.acquireFromPool = this.stats.acquireFromPool + 1;
                }
                this.resetNodeContent(pooledNode, type, content);
                return pooledNode;
            }
            if (this.enableStats) {
                this.stats.acquireNew = this.stats.acquireNew + 1;
            }
            return this.createNode(type, content);
        }
        createNode(type, content = "") {
            switch(type){
                case "text":
                    return {
                        type: "text",
                        content
                    };
                case "html-string":
                    return {
                        type: "html-string",
                        html: content
                    };
                case "component":
                    return {
                        type: "component",
                        instance: void 0
                    };
                case "instruction":
                    return {
                        type: "instruction",
                        instruction: void 0
                    };
            }
        }
        popFromTypedPool(type) {
            switch(type){
                case "text":
                    return this.textPool.pop();
                case "html-string":
                    return this.htmlStringPool.pop();
                case "component":
                    return this.componentPool.pop();
                case "instruction":
                    return this.instructionPool.pop();
            }
        }
        resetNodeContent(node, type, content) {
            switch(type){
                case "text":
                    node.content = content ?? "";
                    break;
                case "html-string":
                    node.html = content ?? "";
                    break;
                case "component":
                    node.instance = void 0;
                    break;
                case "instruction":
                    node.instruction = void 0;
                    break;
            }
        }
        totalPoolSize() {
            return this.textPool.length + this.htmlStringPool.length + this.componentPool.length + this.instructionPool.length;
        }
        release(node) {
            if (this.totalPoolSize() >= this.maxSize) {
                if (this.enableStats) {
                    this.stats.releasedDropped = this.stats.releasedDropped + 1;
                }
                return;
            }
            switch(node.type){
                case "text":
                    node.content = "";
                    this.textPool.push(node);
                    break;
                case "html-string":
                    node.html = "";
                    this.htmlStringPool.push(node);
                    break;
                case "component":
                    node.instance = void 0;
                    this.componentPool.push(node);
                    break;
                case "instruction":
                    node.instruction = void 0;
                    this.instructionPool.push(node);
                    break;
            }
            if (this.enableStats) {
                this.stats.released = this.stats.released + 1;
            }
        }
        releaseAll(nodes) {
            for (const node of nodes){
                this.release(node);
            }
        }
        clear() {
            this.textPool.length = 0;
            this.htmlStringPool.length = 0;
            this.componentPool.length = 0;
            this.instructionPool.length = 0;
        }
        size() {
            return this.totalPoolSize();
        }
        getStats() {
            return {
                ...this.stats,
                poolSize: this.totalPoolSize(),
                maxSize: this.maxSize,
                hitRate: this.stats.acquireFromPool + this.stats.acquireNew > 0 ? this.stats.acquireFromPool / (this.stats.acquireFromPool + this.stats.acquireNew) * 100 : 0
            };
        }
        resetStats() {
            this.stats = {
                acquireFromPool: 0,
                acquireNew: 0,
                released: 0,
                releasedDropped: 0
            };
        }
    }
    class HTMLStringCache {
        cache = new Map();
        maxSize;
        constructor(maxSize = 1e3){
            this.maxSize = maxSize;
            this.warm(COMMON_HTML_PATTERNS);
        }
        getOrCreate(content) {
            const cached = this.cache.get(content);
            if (cached) {
                this.cache.delete(content);
                this.cache.set(content, cached);
                return cached;
            }
            const htmlString = new HTMLString(content);
            this.cache.set(content, htmlString);
            if (this.cache.size > this.maxSize) {
                const firstKey = this.cache.keys().next().value;
                if (firstKey !== void 0) {
                    this.cache.delete(firstKey);
                }
            }
            return htmlString;
        }
        size() {
            return this.cache.size;
        }
        warm(patterns) {
            for (const pattern of patterns){
                if (!this.cache.has(pattern)) {
                    this.cache.set(pattern, new HTMLString(pattern));
                }
            }
        }
        clear() {
            this.cache.clear();
        }
    }
    const COMMON_HTML_PATTERNS = [
        "<div>",
        "</div>",
        "<span>",
        "</span>",
        "<p>",
        "</p>",
        "<section>",
        "</section>",
        "<article>",
        "</article>",
        "<header>",
        "</header>",
        "<footer>",
        "</footer>",
        "<nav>",
        "</nav>",
        "<main>",
        "</main>",
        "<aside>",
        "</aside>",
        "<ul>",
        "</ul>",
        "<ol>",
        "</ol>",
        "<li>",
        "</li>",
        "<br>",
        "<hr>",
        "<br/>",
        "<hr/>",
        "<h1>",
        "</h1>",
        "<h2>",
        "</h2>",
        "<h3>",
        "</h3>",
        "<h4>",
        "</h4>",
        "<a>",
        "</a>",
        "<strong>",
        "</strong>",
        "<em>",
        "</em>",
        "<code>",
        "</code>",
        " ",
        "\n"
    ];
    const FORBIDDEN_PATH_KEYS = new Set([
        "__proto__",
        "constructor",
        "prototype"
    ]);
    const dateTimeFormat = new Intl.DateTimeFormat([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });
    const levels = {
        debug: 20,
        info: 30,
        warn: 40,
        error: 50,
        silent: 90
    };
    function log(opts, level, label, message, newLine = true) {
        const logLevel = opts.level;
        const dest = opts.destination;
        const event = {
            label,
            level,
            message,
            newLine
        };
        if (!isLogLevelEnabled(logLevel, level)) {
            return;
        }
        dest.write(event);
    }
    function isLogLevelEnabled(configuredLogLevel, level) {
        return levels[configuredLogLevel] <= levels[level];
    }
    function info(opts, label, message, newLine = true) {
        return log(opts, "info", label, message, newLine);
    }
    function warn(opts, label, message, newLine = true) {
        return log(opts, "warn", label, message, newLine);
    }
    function error(opts, label, message, newLine = true) {
        return log(opts, "error", label, message, newLine);
    }
    function debug(...args) {
        if ("_astroGlobalDebug" in globalThis) {
            globalThis._astroGlobalDebug(...args);
        }
    }
    function getEventPrefix({ level, label }) {
        const timestamp = `${dateTimeFormat.format(new Date())}`;
        const prefix = [];
        if (level === "error" || level === "warn") {
            prefix.push(colors.bold(timestamp));
            prefix.push(`[${level.toUpperCase()}]`);
        } else {
            prefix.push(timestamp);
        }
        if (label) {
            prefix.push(`[${label}]`);
        }
        if (level === "error") {
            return colors.red(prefix.join(" "));
        }
        if (level === "warn") {
            return colors.yellow(prefix.join(" "));
        }
        if (prefix.length === 1) {
            return colors.dim(prefix[0]);
        }
        return colors.dim(prefix[0]) + " " + colors.blue(prefix.splice(1).join(" "));
    }
    class AstroLogger {
        options;
        constructor(options){
            this.options = options;
        }
        info(label, message, newLine = true) {
            info(this.options, label, message, newLine);
        }
        warn(label, message, newLine = true) {
            warn(this.options, label, message, newLine);
        }
        error(label, message, newLine = true) {
            error(this.options, label, message, newLine);
        }
        debug(label, ...messages) {
            debug(label, ...messages);
        }
        level() {
            return this.options.level;
        }
        forkIntegrationLogger(label) {
            return new AstroIntegrationLogger(this.options, label);
        }
        setDestination(destination) {
            this.options.destination = destination;
        }
        close() {
            if (this.options.destination.close) {
                this.options.destination.close();
            }
        }
        flush() {
            if (this.options.destination.flush) {
                this.options.destination.flush();
            }
        }
    }
    class AstroIntegrationLogger {
        options;
        label;
        constructor(logging, label){
            this.options = logging;
            this.label = label;
        }
        fork(label) {
            return new AstroIntegrationLogger(this.options, label);
        }
        info(message) {
            info(this.options, this.label, message);
        }
        warn(message) {
            warn(this.options, this.label, message);
        }
        error(message) {
            error(this.options, this.label, message);
        }
        debug(message) {
            debug(this.label, message);
        }
        flush() {
            if (this.options.destination.flush) {
                this.options.destination.flush();
            }
        }
        close() {
            if (this.options.destination.close) {
                this.options.destination.close();
            }
        }
    }
    function matchesLevel(messageLevel, configuredLevel) {
        return levels[messageLevel] >= levels[configuredLevel];
    }
    function nodeLogDestination(config = {}) {
        const { level = "info" } = config;
        return {
            write (event) {
                let dest = process.stderr;
                if (levels[event.level] < levels["error"]) {
                    dest = process.stdout;
                }
                if (!matchesLevel(event.level, level)) {
                    return;
                }
                let trailingLine = event.newLine ? "\n" : "";
                if (event.label === "SKIP_FORMAT") {
                    dest.write(event.message + trailingLine);
                } else {
                    dest.write(getEventPrefix(event) + " " + event.message + trailingLine);
                }
            }
        };
    }
    function node_default(options) {
        return nodeLogDestination(options);
    }
    function consoleLogDestination(config = {}) {
        const { level = "info" } = config;
        return {
            write (event) {
                let dest = console.error;
                if (levels[event.level] < levels["error"]) {
                    dest = console.info;
                }
                if (!matchesLevel(event.level, level)) {
                    return;
                }
                if (event.label === "SKIP_FORMAT") {
                    dest(event.message);
                } else {
                    dest(getEventPrefix(event) + " " + event.message);
                }
            }
        };
    }
    function createConsoleLogger({ level }) {
        return new AstroLogger({
            level,
            destination: consoleLogDestination()
        });
    }
    function console_default(options) {
        return consoleLogDestination(options);
    }
    const SGR_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
    function jsonLoggerDestination(config = {}) {
        const { pretty = false, level = "info" } = config;
        return {
            write (event) {
                let dest = process.stderr;
                if (levels[event.level] < levels["error"]) {
                    dest = process.stdout;
                }
                if (!matchesLevel(event.level, level)) {
                    return;
                }
                let trailingLine = event.newLine ? "\n" : "";
                const message = event.message.replace(SGR_REGEX, "");
                if (pretty) {
                    dest.write(JSON.stringify({
                        message,
                        label: event.label,
                        level: event.level
                    }, null, 2) + trailingLine);
                } else {
                    dest.write(JSON.stringify({
                        message,
                        label: event.label,
                        level: event.level
                    }) + trailingLine);
                }
            }
        };
    }
    function compose(destinations) {
        return {
            write (chunk) {
                for (const logger of destinations){
                    logger.write(chunk);
                }
            },
            flush () {
                for (const logger of destinations){
                    if (logger.flush) {
                        logger.flush();
                    }
                }
            },
            close () {
                for (const logger of destinations){
                    if (logger.close) {
                        logger.close();
                    }
                }
            }
        };
    }
    async function loadLogger(config, level = "info") {
        let cause = void 0;
        try {
            switch(config.entrypoint){
                case "astro/logger/node":
                    {
                        return new AstroLogger({
                            destination: node_default(config.config),
                            level
                        });
                    }
                case "astro/logger/console":
                    {
                        return new AstroLogger({
                            destination: console_default(config.config),
                            level
                        });
                    }
                case "astro/logger/json":
                    {
                        return new AstroLogger({
                            destination: jsonLoggerDestination(config.config),
                            level
                        });
                    }
                case "astro/logger/compose":
                    {
                        let destinations = [];
                        if (config.config?.loggers) {
                            const loggers = config.config?.loggers;
                            destinations = await Promise.all(loggers.map(async (loggerConfig)=>{
                                const logger = await import(loggerConfig.entrypoint).then(async (m)=>{
                                    await m.__tla;
                                    return m;
                                });
                                return logger.default(loggerConfig.config);
                            }));
                        }
                        return new AstroLogger({
                            destination: compose(destinations),
                            level
                        });
                    }
                default:
                    {
                        const nodeLogger = await import(config.entrypoint).then(async (m)=>{
                            await m.__tla;
                            return m;
                        });
                        return new AstroLogger({
                            destination: nodeLogger.default(config.config),
                            level
                        });
                    }
            }
        } catch (e) {
            if (e instanceof Error) {
                cause = e;
            }
        }
        const error = new AstroError({
            ...UnableToLoadLogger,
            message: UnableToLoadLogger.message(config.entrypoint)
        });
        if (cause) {
            error.cause = cause;
        }
        throw error;
    }
    const PipelineFeatures = {
        redirects: 1 << 0,
        sessions: 1 << 1,
        actions: 1 << 2,
        middleware: 1 << 3,
        i18n: 1 << 4,
        cache: 1 << 5
    };
    const ALL_PIPELINE_FEATURES = PipelineFeatures.redirects | PipelineFeatures.sessions | PipelineFeatures.actions | PipelineFeatures.middleware | PipelineFeatures.i18n | PipelineFeatures.cache;
    class Pipeline {
        internalMiddleware;
        resolvedMiddleware = void 0;
        resolvedLogger = false;
        resolvedActions = void 0;
        resolvedSessionDriver = void 0;
        resolvedCacheProvider = void 0;
        compiledCacheRoutes = void 0;
        nodePool;
        htmlStringCache;
        usedFeatures = 0;
        logger;
        manifest;
        runtimeMode;
        renderers;
        resolve;
        streaming;
        adapterName;
        clientDirectives;
        inlinedScripts;
        compressHTML;
        i18n;
        middleware;
        routeCache;
        site;
        defaultRoutes;
        actions;
        sessionDriver;
        cacheProvider;
        cacheConfig;
        serverIslands;
        manifestData;
        #router;
        constructor(logger, manifest, runtimeMode, renderers, resolve, streaming, adapterName = manifest.adapterName, clientDirectives = manifest.clientDirectives, inlinedScripts = manifest.inlinedScripts, compressHTML = manifest.compressHTML, i18n = manifest.i18n, middleware = manifest.middleware, routeCache = new RouteCache(logger, runtimeMode), site = manifest.site ? new URL(manifest.site) : void 0, defaultRoutes = createDefaultRoutes(manifest), actions = manifest.actions, sessionDriver = manifest.sessionDriver, cacheProvider = manifest.cacheProvider, cacheConfig = manifest.cacheConfig, serverIslands = manifest.serverIslandMappings){
            this.logger = logger;
            this.manifest = manifest;
            this.runtimeMode = runtimeMode;
            this.renderers = renderers;
            this.resolve = resolve;
            this.streaming = streaming;
            this.adapterName = adapterName;
            this.clientDirectives = clientDirectives;
            this.inlinedScripts = inlinedScripts;
            this.compressHTML = compressHTML;
            this.i18n = i18n;
            this.middleware = middleware;
            this.routeCache = routeCache;
            this.site = site;
            this.defaultRoutes = defaultRoutes;
            this.actions = actions;
            this.sessionDriver = sessionDriver;
            this.cacheProvider = cacheProvider;
            this.cacheConfig = cacheConfig;
            this.serverIslands = serverIslands;
            this.manifestData = {
                routes: (manifest.routes ?? []).map((route)=>route.routeData)
            };
            ensure404Route(this.manifestData);
            this.#router = new Router(this.manifestData.routes, {
                base: manifest.base,
                trailingSlash: manifest.trailingSlash,
                buildFormat: manifest.buildFormat
            });
            this.internalMiddleware = [];
            if (manifest.experimentalQueuedRendering.enabled) {
                this.nodePool = this.createNodePool(manifest.experimentalQueuedRendering.poolSize ?? 1e3, false);
                if (manifest.experimentalQueuedRendering.contentCache) {
                    this.htmlStringCache = this.createStringCache();
                }
            }
        }
        matchRoute(pathname) {
            const match = this.#router.match(pathname, {
                allowWithoutBase: true
            });
            if (match.type !== "match") return void 0;
            return match.route;
        }
        matchAllRoutes(pathname) {
            return this.#router.matchAll(pathname, {
                allowWithoutBase: true
            });
        }
        rebuildRouter() {
            this.#router = new Router(this.manifestData.routes, {
                base: this.manifest.base,
                trailingSlash: this.manifest.trailingSlash,
                buildFormat: this.manifest.buildFormat
            });
        }
        async getMiddleware() {
            if (this.resolvedMiddleware) {
                return this.resolvedMiddleware;
            }
            if (this.middleware) {
                const middlewareInstance = await this.middleware();
                const onRequest = middlewareInstance.onRequest ?? NOOP_MIDDLEWARE_FN;
                const internalMiddlewares = [
                    onRequest
                ];
                if (this.manifest.checkOrigin) {
                    internalMiddlewares.unshift(createOriginCheckMiddleware());
                }
                this.resolvedMiddleware = sequence(...internalMiddlewares);
                return this.resolvedMiddleware;
            } else {
                this.resolvedMiddleware = NOOP_MIDDLEWARE_FN;
                return this.resolvedMiddleware;
            }
        }
        clearMiddleware() {
            this.resolvedMiddleware = void 0;
        }
        async getLogger() {
            if (this.resolvedLogger) {
                return this.logger;
            }
            this.resolvedLogger = true;
            if (this.manifest.experimentalLogger) {
                this.logger = await loadLogger(this.manifest.experimentalLogger);
            }
            return this.logger;
        }
        async getActions() {
            if (this.resolvedActions) {
                return this.resolvedActions;
            } else if (this.actions) {
                this.resolvedActions = await this.actions();
                return this.resolvedActions;
            }
            return NOOP_ACTIONS_MOD;
        }
        async getSessionDriver() {
            if (this.resolvedSessionDriver !== void 0) {
                return this.resolvedSessionDriver;
            }
            if (this.sessionDriver) {
                const driverModule = await this.sessionDriver();
                this.resolvedSessionDriver = driverModule?.default || null;
                return this.resolvedSessionDriver;
            }
            this.resolvedSessionDriver = null;
            return null;
        }
        async getCacheProvider() {
            if (this.resolvedCacheProvider !== void 0) {
                return this.resolvedCacheProvider;
            }
            if (this.cacheProvider) {
                const mod = await this.cacheProvider();
                const factory = mod?.default || null;
                this.resolvedCacheProvider = factory ? factory(this.cacheConfig?.options) : null;
                return this.resolvedCacheProvider;
            }
            this.resolvedCacheProvider = null;
            return null;
        }
        async getServerIslands() {
            if (this.serverIslands) {
                return this.serverIslands();
            }
            return {
                serverIslandMap: new Map(),
                serverIslandNameMap: new Map()
            };
        }
        async getAction(path) {
            const pathKeys = path.split(".").map((key)=>decodeURIComponent(key));
            let { server } = await this.getActions();
            if (!server || !(typeof server === "object")) {
                throw new TypeError(`Expected \`server\` export in actions file to be an object. Received ${typeof server}.`);
            }
            for (const key of pathKeys){
                if (FORBIDDEN_PATH_KEYS.has(key)) {
                    throw new AstroError({
                        ...ActionNotFoundError,
                        message: ActionNotFoundError.message(pathKeys.join("."))
                    });
                }
                if (!Object.hasOwn(server, key)) {
                    throw new AstroError({
                        ...ActionNotFoundError,
                        message: ActionNotFoundError.message(pathKeys.join("."))
                    });
                }
                server = server[key];
            }
            if (typeof server !== "function") {
                throw new TypeError(`Expected handler for action ${pathKeys.join(".")} to be a function. Received ${typeof server}.`);
            }
            return server;
        }
        async getModuleForRoute(route) {
            for (const defaultRoute of this.defaultRoutes){
                if (route.component === defaultRoute.component) {
                    return {
                        page: ()=>Promise.resolve(defaultRoute.instance)
                    };
                }
            }
            if (route.type === "redirect") {
                return RedirectSinglePageBuiltModule;
            } else {
                if (this.manifest.pageMap) {
                    const importComponentInstance = this.manifest.pageMap.get(route.component);
                    if (!importComponentInstance) {
                        throw new Error(`Unexpectedly unable to find a component instance for route ${route.route}`);
                    }
                    return await importComponentInstance();
                } else if (this.manifest.pageModule) {
                    return this.manifest.pageModule;
                }
                throw new Error("Astro couldn't find the correct page to render, probably because it wasn't correctly mapped for SSR usage. This is an internal error, please file an issue.");
            }
        }
        createNodePool(poolSize, stats) {
            return new NodePool(poolSize, stats);
        }
        createStringCache() {
            return new HTMLStringCache(1e3);
        }
    }
    function getFunctionExpression(slot) {
        if (!slot) return;
        const expressions = slot?.expressions?.filter((e)=>isRenderInstruction(e) === false || isRenderTemplateResult(e));
        if (expressions?.length !== 1) return;
        const expression = expressions[0];
        if (isRenderTemplateResult(expression)) {
            return getFunctionExpression(expression);
        }
        return expression;
    }
    class Slots {
        #result;
        #slots;
        #logger;
        constructor(result, slots, logger){
            this.#result = result;
            this.#slots = slots;
            this.#logger = logger;
            if (slots) {
                for (const key of Object.keys(slots)){
                    if (this[key] !== void 0) {
                        throw new AstroError({
                            ...ReservedSlotName,
                            message: ReservedSlotName.message(key)
                        });
                    }
                    Object.defineProperty(this, key, {
                        get () {
                            return true;
                        },
                        enumerable: true
                    });
                }
            }
        }
        has(name) {
            if (!this.#slots) return false;
            return Boolean(this.#slots[name]);
        }
        async render(name, args = []) {
            if (!this.#slots || !this.has(name)) return;
            const result = this.#result;
            if (!Array.isArray(args)) {
                this.#logger.warn(null, `Expected second parameter to be an array, received a ${typeof args}. If you're trying to pass an array as a single argument and getting unexpected results, make sure you're passing your array as an item of an array. Ex: Astro.slots.render('default', [["Hello", "World"]])`);
            } else if (args.length > 0) {
                const slotValue = this.#slots[name];
                const component = typeof slotValue === "function" ? await slotValue(result) : await slotValue;
                const expression = getFunctionExpression(component);
                if (expression) {
                    const slot = async ()=>typeof expression === "function" ? expression(...args) : expression;
                    return await renderSlotToString(result, slot).then((res)=>{
                        return res;
                    });
                }
                if (typeof component === "function") {
                    return await renderJSX(result, component(...args)).then((res)=>res != null ? String(res) : res);
                }
            }
            const content = await renderSlotToString(result, this.#slots[name]);
            const outHTML = chunkToString(result, content);
            return outHTML;
        }
    }
    function deduplicateDirectiveValues(existingDirective, newDirective) {
        const [directiveName, ...existingValues] = existingDirective.split(/\s+/).filter(Boolean);
        const [newDirectiveName, ...newValues] = newDirective.split(/\s+/).filter(Boolean);
        if (directiveName !== newDirectiveName) {
            return void 0;
        }
        const finalDirectives = Array.from(new Set([
            ...existingValues,
            ...newValues
        ]));
        return `${directiveName} ${finalDirectives.join(" ")}`;
    }
    function pushDirective(directives, newDirective) {
        if (directives.length === 0) {
            return [
                newDirective
            ];
        }
        const finalDirectives = [];
        let matched = false;
        for (const directive of directives){
            if (matched) {
                finalDirectives.push(directive);
                continue;
            }
            const result = deduplicateDirectiveValues(directive, newDirective);
            if (result) {
                finalDirectives.push(result);
                matched = true;
            } else {
                finalDirectives.push(directive);
            }
        }
        if (!matched) {
            finalDirectives.push(newDirective);
        }
        return finalDirectives;
    }
    function computeFallbackRoute(options) {
        const { pathname, responseStatus, fallback, fallbackType, locales, defaultLocale, strategy, base } = options;
        if (responseStatus !== 404) {
            return {
                type: "none"
            };
        }
        if (!fallback || Object.keys(fallback).length === 0) {
            return {
                type: "none"
            };
        }
        const segments = pathname.split("/");
        const urlLocale = segments.find((segment)=>{
            for (const locale of locales){
                if (typeof locale === "string") {
                    if (locale === segment) {
                        return true;
                    }
                } else if (locale.path === segment) {
                    return true;
                }
            }
            return false;
        });
        if (!urlLocale) {
            return {
                type: "none"
            };
        }
        const fallbackKeys = Object.keys(fallback);
        if (!fallbackKeys.includes(urlLocale)) {
            return {
                type: "none"
            };
        }
        const fallbackLocale = fallback[urlLocale];
        const pathFallbackLocale = getPathByLocale(fallbackLocale, locales);
        let newPathname;
        if (pathFallbackLocale === defaultLocale && strategy === "pathname-prefix-other-locales") {
            if (pathname.includes(`${base}`)) {
                newPathname = pathname.replace(`/${urlLocale}`, ``);
            } else {
                newPathname = pathname.replace(`/${urlLocale}`, `/`);
            }
        } else {
            newPathname = pathname.replace(`/${urlLocale}`, `/${pathFallbackLocale}`);
        }
        return {
            type: fallbackType,
            pathname: newPathname
        };
    }
    class I18nRouter {
        #strategy;
        #defaultLocale;
        #locales;
        #base;
        #domains;
        constructor(options){
            this.#strategy = options.strategy;
            this.#defaultLocale = options.defaultLocale;
            this.#locales = options.locales;
            this.#base = options.base === "/" ? "/" : removeTrailingForwardSlash(options.base || "");
            this.#domains = options.domains;
        }
        match(pathname, context) {
            if (this.shouldSkipProcessing(pathname, context)) {
                return {
                    type: "continue"
                };
            }
            switch(this.#strategy){
                case "manual":
                    return {
                        type: "continue"
                    };
                case "pathname-prefix-always":
                    return this.matchPrefixAlways(pathname, context);
                case "domains-prefix-always":
                    if (this.localeHasntDomain(context.currentLocale, context.currentDomain)) {
                        return {
                            type: "continue"
                        };
                    }
                    return this.matchPrefixAlways(pathname, context);
                case "pathname-prefix-other-locales":
                    return this.matchPrefixOtherLocales(pathname, context);
                case "domains-prefix-other-locales":
                    if (this.localeHasntDomain(context.currentLocale, context.currentDomain)) {
                        return {
                            type: "continue"
                        };
                    }
                    return this.matchPrefixOtherLocales(pathname, context);
                case "pathname-prefix-always-no-redirect":
                    return this.matchPrefixAlwaysNoRedirect(pathname, context);
                case "domains-prefix-always-no-redirect":
                    if (this.localeHasntDomain(context.currentLocale, context.currentDomain)) {
                        return {
                            type: "continue"
                        };
                    }
                    return this.matchPrefixAlwaysNoRedirect(pathname, context);
                default:
                    return {
                        type: "continue"
                    };
            }
        }
        shouldSkipProcessing(pathname, context) {
            if (pathname.includes("/404") || pathname.includes("/500")) {
                return true;
            }
            if (pathname.includes("/_server-islands/")) {
                return true;
            }
            if (context.isReroute) {
                return true;
            }
            if (context.routeType && context.routeType !== "page" && context.routeType !== "fallback") {
                return true;
            }
            return false;
        }
        matchPrefixAlways(pathname, _context) {
            const isRoot = pathname === this.#base + "/" || pathname === this.#base;
            if (isRoot) {
                const basePrefix = this.#base === "/" ? "" : this.#base;
                return {
                    type: "redirect",
                    location: `${basePrefix}/${this.#defaultLocale}`
                };
            }
            if (!pathHasLocale(pathname, this.#locales)) {
                return {
                    type: "notFound"
                };
            }
            return {
                type: "continue"
            };
        }
        matchPrefixOtherLocales(pathname, _context) {
            let pathnameContainsDefaultLocale = false;
            for (const segment of pathname.split("/")){
                if (normalizeTheLocale(segment) === normalizeTheLocale(this.#defaultLocale)) {
                    pathnameContainsDefaultLocale = true;
                    break;
                }
            }
            if (pathnameContainsDefaultLocale) {
                const newLocation = pathname.replace(`/${this.#defaultLocale}`, "");
                return {
                    type: "notFound",
                    location: newLocation
                };
            }
            return {
                type: "continue"
            };
        }
        matchPrefixAlwaysNoRedirect(pathname, _context) {
            const isRoot = pathname === this.#base + "/" || pathname === this.#base;
            if (isRoot) {
                return {
                    type: "continue"
                };
            }
            if (!pathHasLocale(pathname, this.#locales)) {
                return {
                    type: "notFound"
                };
            }
            return {
                type: "continue"
            };
        }
        localeHasntDomain(currentLocale, currentDomain) {
            if (!this.#domains || !currentDomain) {
                return false;
            }
            if (!currentLocale) {
                return false;
            }
            const localesForDomain = this.#domains[currentDomain];
            if (!localesForDomain) {
                return true;
            }
            return !localesForDomain.includes(currentLocale);
        }
    }
    class I18n {
        #i18n;
        #base;
        #trailingSlash;
        #format;
        #router;
        constructor(i18n, base, trailingSlash, format){
            this.#i18n = i18n;
            this.#base = base;
            this.#trailingSlash = trailingSlash;
            this.#format = format;
            this.#router = new I18nRouter({
                strategy: i18n.strategy,
                defaultLocale: i18n.defaultLocale,
                locales: i18n.locales,
                base,
                domains: i18n.domainLookupTable ? Object.keys(i18n.domainLookupTable).reduce((acc, domain)=>{
                    const locale = i18n.domainLookupTable[domain];
                    if (!acc[domain]) {
                        acc[domain] = [];
                    }
                    acc[domain].push(locale);
                    return acc;
                }, {}) : void 0
            });
        }
        async finalize(state, response) {
            state.pipeline.usedFeatures |= PipelineFeatures.i18n;
            const i18n = this.#i18n;
            const typeHeader = response.headers.get(ROUTE_TYPE_HEADER);
            if (typeHeader) {
                response.headers.delete(ROUTE_TYPE_HEADER);
            }
            const isReroute = response.headers.get(REROUTE_DIRECTIVE_HEADER);
            if (isReroute === "no" && typeof i18n.fallback === "undefined") {
                return response;
            }
            if (typeHeader !== "page" && typeHeader !== "fallback") {
                return response;
            }
            const url = new URL(state.request.url);
            const currentLocale = state.computeCurrentLocale();
            const isPrerendered = state.routeData.prerender;
            const routerContext = {
                currentLocale,
                currentDomain: url.hostname,
                routeType: typeHeader,
                isReroute: isReroute === "yes"
            };
            const routeDecision = this.#router.match(url.pathname, routerContext);
            switch(routeDecision.type){
                case "redirect":
                    {
                        let location = routeDecision.location;
                        if (shouldAppendForwardSlash(this.#trailingSlash, this.#format)) {
                            location = appendForwardSlash(location);
                        }
                        return new Response(null, {
                            status: routeDecision.status ?? 302,
                            headers: {
                                Location: location
                            }
                        });
                    }
                case "notFound":
                    {
                        if (isPrerendered) {
                            const prerenderedRes = new Response(response.body, {
                                status: 404,
                                headers: response.headers
                            });
                            prerenderedRes.headers.set(REROUTE_DIRECTIVE_HEADER, "no");
                            if (routeDecision.location) {
                                prerenderedRes.headers.set("Location", routeDecision.location);
                            }
                            return prerenderedRes;
                        }
                        const headers = new Headers();
                        if (routeDecision.location) {
                            headers.set("Location", routeDecision.location);
                        }
                        return new Response(null, {
                            status: 404,
                            headers
                        });
                    }
            }
            if (i18n.fallback && i18n.fallbackType) {
                const effectiveStatus = typeHeader === "fallback" ? 404 : response.status;
                const fallbackDecision = computeFallbackRoute({
                    pathname: url.pathname,
                    responseStatus: effectiveStatus,
                    fallback: i18n.fallback,
                    fallbackType: i18n.fallbackType,
                    locales: i18n.locales,
                    defaultLocale: i18n.defaultLocale,
                    strategy: i18n.strategy,
                    base: this.#base
                });
                switch(fallbackDecision.type){
                    case "redirect":
                        return new Response(null, {
                            status: 302,
                            headers: {
                                Location: fallbackDecision.pathname + url.search
                            }
                        });
                    case "rewrite":
                        return await state.rewrite(fallbackDecision.pathname + url.search);
                }
            }
            return response;
        }
    }
    function pathHasLocale(path, locales) {
        const segments = path.split("/").map(normalizeThePath);
        for (const segment of segments){
            for (const locale of locales){
                if (typeof locale === "string") {
                    if (normalizeTheLocale(segment) === normalizeTheLocale(locale)) {
                        return true;
                    }
                } else if (segment === locale.path) {
                    return true;
                }
            }
        }
        return false;
    }
    function getPathByLocale(locale, locales) {
        for (const loopLocale of locales){
            if (typeof loopLocale === "string") {
                if (loopLocale === locale) {
                    return loopLocale;
                }
            } else {
                for (const code of loopLocale.codes){
                    if (code === locale) {
                        return loopLocale.path;
                    }
                }
            }
        }
        throw new AstroError(i18nNoLocaleFoundInPath);
    }
    function normalizeTheLocale(locale) {
        return locale.replaceAll("_", "-").toLowerCase();
    }
    function normalizeThePath(path) {
        return path.endsWith(".html") ? path.slice(0, -5) : path;
    }
    function getAllCodes(locales) {
        const result = [];
        for (const loopLocale of locales){
            if (typeof loopLocale === "string") {
                result.push(loopLocale);
            } else {
                result.push(...loopLocale.codes);
            }
        }
        return result;
    }
    function parseLocale(header) {
        if (header === "*") {
            return [
                {
                    locale: header,
                    qualityValue: void 0
                }
            ];
        }
        const result = [];
        const localeValues = header.split(",").map((str)=>str.trim());
        for (const localeValue of localeValues){
            const split = localeValue.split(";").map((str)=>str.trim());
            const localeName = split[0];
            const qualityValue = split[1];
            if (!split) {
                continue;
            }
            if (qualityValue && qualityValue.startsWith("q=")) {
                const qualityValueAsFloat = Number.parseFloat(qualityValue.slice("q=".length));
                if (Number.isNaN(qualityValueAsFloat) || qualityValueAsFloat > 1) {
                    result.push({
                        locale: localeName,
                        qualityValue: void 0
                    });
                } else {
                    result.push({
                        locale: localeName,
                        qualityValue: qualityValueAsFloat
                    });
                }
            } else {
                result.push({
                    locale: localeName,
                    qualityValue: void 0
                });
            }
        }
        return result;
    }
    function sortAndFilterLocales(browserLocaleList, locales) {
        const normalizedLocales = getAllCodes(locales).map(normalizeTheLocale);
        return browserLocaleList.filter((browserLocale)=>{
            if (browserLocale.locale !== "*") {
                return normalizedLocales.includes(normalizeTheLocale(browserLocale.locale));
            }
            return true;
        }).sort((a, b)=>{
            if (a.qualityValue && b.qualityValue) {
                return Math.sign(b.qualityValue - a.qualityValue);
            }
            return 0;
        });
    }
    function computePreferredLocale(request, locales) {
        const acceptHeader = request.headers.get("Accept-Language");
        let result = void 0;
        if (acceptHeader) {
            const browserLocaleList = sortAndFilterLocales(parseLocale(acceptHeader), locales);
            const firstResult = browserLocaleList.at(0);
            if (firstResult && firstResult.locale !== "*") {
                outer: for (const currentLocale of locales){
                    if (typeof currentLocale === "string") {
                        if (normalizeTheLocale(currentLocale) === normalizeTheLocale(firstResult.locale)) {
                            result = currentLocale;
                            break;
                        }
                    } else {
                        for (const currentCode of currentLocale.codes){
                            if (normalizeTheLocale(currentCode) === normalizeTheLocale(firstResult.locale)) {
                                result = currentCode;
                                break outer;
                            }
                        }
                    }
                }
            }
        }
        return result;
    }
    function computePreferredLocaleList(request, locales) {
        const acceptHeader = request.headers.get("Accept-Language");
        let result = [];
        if (acceptHeader) {
            const browserLocaleList = sortAndFilterLocales(parseLocale(acceptHeader), locales);
            if (browserLocaleList.length === 1 && browserLocaleList.at(0).locale === "*") {
                return getAllCodes(locales);
            } else if (browserLocaleList.length > 0) {
                for (const browserLocale of browserLocaleList){
                    for (const loopLocale of locales){
                        if (typeof loopLocale === "string") {
                            if (normalizeTheLocale(loopLocale) === normalizeTheLocale(browserLocale.locale)) {
                                result.push(loopLocale);
                            }
                        } else {
                            for (const code of loopLocale.codes){
                                if (code === browserLocale.locale) {
                                    result.push(code);
                                }
                            }
                        }
                    }
                }
            }
        }
        return result;
    }
    function computeCurrentLocale(pathname, locales, defaultLocale) {
        for (const segment of pathname.split("/").map(normalizeThePath)){
            for (const locale of locales){
                if (typeof locale === "string") {
                    if (!segment.includes(locale)) continue;
                    if (normalizeTheLocale(locale) === normalizeTheLocale(segment)) {
                        return locale;
                    }
                } else {
                    if (locale.path === segment) {
                        return locale.codes.at(0);
                    } else {
                        for (const code of locale.codes){
                            if (normalizeTheLocale(code) === normalizeTheLocale(segment)) {
                                return code;
                            }
                        }
                    }
                }
            }
        }
        for (const locale of locales){
            if (typeof locale === "string") {
                if (locale === defaultLocale) {
                    return locale;
                }
            } else {
                if (locale.path === defaultLocale) {
                    return locale.codes.at(0);
                }
            }
        }
    }
    function computeCurrentLocaleFromParams(params, locales) {
        const byNormalizedCode = new Map();
        const byPath = new Map();
        for (const locale of locales){
            if (typeof locale === "string") {
                byNormalizedCode.set(normalizeTheLocale(locale), locale);
            } else {
                byPath.set(locale.path, locale.codes[0]);
                for (const code of locale.codes){
                    byNormalizedCode.set(normalizeTheLocale(code), code);
                }
            }
        }
        for (const value of Object.values(params)){
            if (!value) continue;
            const pathMatch = byPath.get(value);
            if (pathMatch) return pathMatch;
            const codeMatch = byNormalizedCode.get(normalizeTheLocale(value));
            if (codeMatch) return codeMatch;
        }
    }
    async function callMiddleware(onRequest, apiContext, responseFunction) {
        let nextCalled = false;
        let responseFunctionPromise = void 0;
        const next = async (payload)=>{
            nextCalled = true;
            responseFunctionPromise = responseFunction(apiContext, payload);
            return responseFunctionPromise;
        };
        const middlewarePromise = onRequest(apiContext, next);
        return await Promise.resolve(middlewarePromise).then(async (value)=>{
            if (nextCalled) {
                if (typeof value !== "undefined") {
                    if (value instanceof Response === false) {
                        throw new AstroError(MiddlewareNotAResponse);
                    }
                    return value;
                } else {
                    if (responseFunctionPromise) {
                        return responseFunctionPromise;
                    } else {
                        throw new AstroError(MiddlewareNotAResponse);
                    }
                }
            } else if (typeof value === "undefined") {
                throw new AstroError(MiddlewareNoDataOrNextCalled);
            } else if (value instanceof Response === false) {
                throw new AstroError(MiddlewareNotAResponse);
            } else {
                return value;
            }
        });
    }
    const EMPTY_OPTIONS = Object.freeze({
        tags: []
    });
    class NoopAstroCache {
        enabled = false;
        set() {}
        get tags() {
            return [];
        }
        get options() {
            return EMPTY_OPTIONS;
        }
        async invalidate() {}
    }
    let hasWarned = false;
    class DisabledAstroCache {
        enabled = false;
        #logger;
        constructor(logger){
            this.#logger = logger;
        }
        #warn() {
            if (!hasWarned) {
                hasWarned = true;
                this.#logger?.warn("cache", "`cache.set()` was called but caching is not enabled. Configure a cache provider in your Astro config under `experimental.cache` to enable caching.");
            }
        }
        set() {
            this.#warn();
        }
        get tags() {
            return [];
        }
        get options() {
            return EMPTY_OPTIONS;
        }
        async invalidate() {
            throw new AstroError(CacheNotEnabled);
        }
    }
    class AstroMiddleware {
        #pipeline;
        constructor(pipeline){
            this.#pipeline = pipeline;
        }
        async handle(state, renderRouteCallback) {
            state.pipeline.usedFeatures |= PipelineFeatures.middleware;
            const pipeline = this.#pipeline;
            await state.getProps();
            const apiContext = state.getAPIContext();
            state.counter++;
            if (state.counter === 4) {
                return new Response("Loop Detected", {
                    status: 508,
                    statusText: "Astro detected a loop where you tried to call the rewriting logic more than four times."
                });
            }
            const next = async (ctx, payload)=>{
                if (payload) {
                    pipeline.logger.debug("router", "Called rewriting to:", payload);
                    const result = await pipeline.tryRewrite(payload, state.request);
                    applyRewriteToState(state, payload, result);
                }
                return renderRouteCallback(state, ctx);
            };
            let response;
            if (state.skipMiddleware) {
                response = await next(apiContext);
            } else {
                const pipelineMiddleware = await pipeline.getMiddleware();
                const composed = sequence(...pipeline.internalMiddleware, pipelineMiddleware);
                response = await callMiddleware(composed, apiContext, next);
            }
            response = this.#finalize(state, response);
            state.response = response;
            return response;
        }
        #finalize(state, response) {
            attachCookiesToResponse(response, state.cookies);
            return response;
        }
    }
    const EMPTY_SLOTS = Object.freeze({});
    class PagesHandler {
        #pipeline;
        constructor(pipeline){
            this.#pipeline = pipeline;
        }
        async handle(state, ctx) {
            const pipeline = this.#pipeline;
            const { logger, streaming } = pipeline;
            let response;
            const componentInstance = await state.loadComponentInstance();
            switch(state.routeData.type){
                case "endpoint":
                    {
                        response = await renderEndpoint(componentInstance, ctx, state.routeData.prerender, logger);
                        break;
                    }
                case "page":
                    {
                        const props = await state.getProps();
                        const actionApiContext = state.getActionAPIContext();
                        const result = await state.createResult(componentInstance, actionApiContext);
                        try {
                            response = await renderPage(result, componentInstance?.default, props, state.slots ?? EMPTY_SLOTS, streaming, state.routeData);
                        } catch (e) {
                            result.cancelled = true;
                            throw e;
                        }
                        response.headers.set(ROUTE_TYPE_HEADER, "page");
                        if (state.routeData.route === "/404" || state.routeData.route === "/500") {
                            response.headers.set(REROUTE_DIRECTIVE_HEADER, "no");
                        }
                        if (state.isRewriting) {
                            response.headers.set(REWRITE_DIRECTIVE_HEADER_KEY, REWRITE_DIRECTIVE_HEADER_VALUE);
                        }
                        break;
                    }
                case "redirect":
                    {
                        return new Response(null, {
                            status: 404,
                            headers: {
                                [ASTRO_ERROR_HEADER]: "true"
                            }
                        });
                    }
                case "fallback":
                    {
                        return new Response(null, {
                            status: 500,
                            headers: {
                                [ROUTE_TYPE_HEADER]: "fallback"
                            }
                        });
                    }
            }
            const responseCookies = getCookiesFromResponse(response);
            if (responseCookies) {
                state.cookies.merge(responseCookies);
            }
            state.response = response;
            return response;
        }
    }
    class MultiLevelEncodingError extends Error {
        constructor(){
            super("Multi-level URL encoding is not allowed");
            this.name = "MultiLevelEncodingError";
        }
    }
    const ENCODING_REGEX = /%25[0-9a-fA-F]{2}/;
    function validateAndDecodePathname(pathname) {
        if (ENCODING_REGEX.test(pathname)) {
            throw new MultiLevelEncodingError();
        }
        let decoded;
        try {
            decoded = decodeURI(pathname);
        } catch (_e) {
            throw new Error("Invalid URL encoding");
        }
        if (ENCODING_REGEX.test(decoded)) {
            throw new MultiLevelEncodingError();
        }
        return decoded;
    }
    function createNormalizedUrl(requestUrl) {
        return normalizeUrl(new URL(requestUrl));
    }
    function normalizeUrl(url) {
        try {
            url.pathname = validateAndDecodePathname(url.pathname);
        } catch (e) {
            if (e instanceof MultiLevelEncodingError) {
                throw e;
            }
            try {
                url.pathname = decodeURI(url.pathname);
            } catch  {}
        }
        url.pathname = collapseDuplicateSlashes(url.pathname);
        return url;
    }
    function applyRewriteToState(state, payload, { routeData, componentInstance, newUrl, pathname }, { mergeCookies = false } = {}) {
        const pipeline = state.pipeline;
        const oldPathname = state.pathname;
        const isI18nFallback = routeData.fallbackRoutes && routeData.fallbackRoutes.length > 0;
        if (pipeline.manifest.serverLike && !state.routeData.prerender && routeData.prerender && !isI18nFallback) {
            throw new AstroError({
                ...ForbiddenRewrite,
                message: ForbiddenRewrite.message(state.pathname, pathname, routeData.component),
                hint: ForbiddenRewrite.hint(routeData.component)
            });
        }
        state.routeData = routeData;
        state.componentInstance = componentInstance;
        if (payload instanceof Request) {
            state.request = payload;
        } else {
            state.request = copyRequest(newUrl, state.request, routeData.prerender, pipeline.logger, state.routeData.route);
        }
        state.url = createNormalizedUrl(state.request.url);
        if (mergeCookies) {
            const newCookies = new AstroCookies(state.request);
            if (state.cookies) {
                newCookies.merge(state.cookies);
            }
            state.cookies = newCookies;
        }
        state.params = getParams(routeData, pathname);
        state.pathname = pathname;
        state.isRewriting = true;
        state.status = 200;
        setOriginPathname(state.request, oldPathname, pipeline.manifest.trailingSlash, pipeline.manifest.buildFormat);
        state.invalidateContexts();
    }
    class Rewrites {
        async execute(state, payload) {
            const pipeline = state.pipeline;
            pipeline.logger.debug("router", "Calling rewrite: ", payload);
            const result = await pipeline.tryRewrite(payload, state.request);
            applyRewriteToState(state, payload, result, {
                mergeCookies: true
            });
            const middleware = new AstroMiddleware(pipeline);
            const pagesHandler = new PagesHandler(pipeline);
            return middleware.handle(state, pagesHandler.handle.bind(pagesHandler));
        }
    }
    function matchRoute(pathname, manifest) {
        if (isRoute404(pathname)) {
            const errorRoute = manifest.routes.find((route)=>isRoute404(route.route));
            if (errorRoute) return errorRoute;
        }
        if (isRoute500(pathname)) {
            const errorRoute = manifest.routes.find((route)=>isRoute500(route.route));
            if (errorRoute) return errorRoute;
        }
        return manifest.routes.find((route)=>{
            return route.pattern.test(pathname) || route.fallbackRoutes.some((fallbackRoute)=>fallbackRoute.pattern.test(pathname));
        });
    }
    function isRoute404or500(route) {
        return isRoute404(route.route) || isRoute500(route.route);
    }
    function isRouteServerIsland(route) {
        return route.component === SERVER_ISLAND_COMPONENT;
    }
    function computePathnameFromDomain(request, url, i18n, base, trailingSlash, logger) {
        let pathname = void 0;
        if (i18n && (i18n.strategy === "domains-prefix-always" || i18n.strategy === "domains-prefix-other-locales" || i18n.strategy === "domains-prefix-always-no-redirect")) {
            let host = request.headers.get("X-Forwarded-Host");
            let protocol = request.headers.get("X-Forwarded-Proto");
            if (protocol) {
                protocol = protocol + ":";
            } else {
                protocol = url.protocol;
            }
            if (!host) {
                host = request.headers.get("Host");
            }
            if (host && protocol) {
                host = host.split(":")[0];
                try {
                    let locale;
                    const hostAsUrl = new URL(`${protocol}//${host}`);
                    for (const [domainKey, localeValue] of Object.entries(i18n.domainLookupTable)){
                        const domainKeyAsUrl = new URL(domainKey);
                        if (hostAsUrl.host === domainKeyAsUrl.host && hostAsUrl.protocol === domainKeyAsUrl.protocol) {
                            locale = localeValue;
                            break;
                        }
                    }
                    if (locale) {
                        pathname = prependForwardSlash$1(joinPaths(normalizeTheLocale(locale), removeBase(url.pathname, base)));
                        if (trailingSlash === "always") {
                            pathname = appendForwardSlash(pathname);
                        } else if (trailingSlash === "never") {
                            pathname = removeTrailingForwardSlash(pathname);
                        } else if (url.pathname.endsWith("/")) {
                            pathname = appendForwardSlash(pathname);
                        }
                    }
                } catch (e) {
                    logger.error("router", `Astro tried to parse ${protocol}//${host} as an URL, but it threw a parsing error. Check the X-Forwarded-Host and X-Forwarded-Proto headers.`);
                    logger.error("router", `Error: ${e}`);
                }
            }
        }
        return pathname;
    }
    function removeBase(pathname, base) {
        pathname = collapseDuplicateLeadingSlashes(pathname);
        if (pathname.startsWith(base)) {
            return pathname.slice(removeTrailingForwardSlash(base).length + 1);
        }
        return pathname;
    }
    const renderOptionsSymbol = Symbol.for("astro.renderOptions");
    function getRenderOptions(request) {
        return Reflect.get(request, renderOptionsSymbol);
    }
    function setRenderOptions(request, options) {
        Reflect.set(request, renderOptionsSymbol, options);
    }
    function matchPattern(url, remotePattern) {
        return matchProtocol(url, remotePattern.protocol) && matchHostname(url, remotePattern.hostname, true) && matchPort(url, remotePattern.port) && matchPathname(url, remotePattern.pathname, true);
    }
    function matchPort(url, port) {
        return !port || port === url.port;
    }
    function matchProtocol(url, protocol) {
        return !protocol || protocol === url.protocol.slice(0, -1);
    }
    function matchHostname(url, hostname, allowWildcard = false) {
        if (!hostname) {
            return true;
        } else if (!allowWildcard || !hostname.startsWith("*")) {
            return hostname === url.hostname;
        } else if (hostname.startsWith("**.")) {
            const slicedHostname = hostname.slice(2);
            return slicedHostname !== url.hostname && url.hostname.endsWith(slicedHostname);
        } else if (hostname.startsWith("*.")) {
            const slicedHostname = hostname.slice(1);
            if (!url.hostname.endsWith(slicedHostname)) {
                return false;
            }
            const subdomainWithDot = url.hostname.slice(0, -(slicedHostname.length - 1));
            return subdomainWithDot.endsWith(".") && !subdomainWithDot.slice(0, -1).includes(".");
        }
        return false;
    }
    function matchPathname(url, pathname, allowWildcard = false) {
        if (!pathname) {
            return true;
        } else if (!allowWildcard || !pathname.endsWith("*")) {
            return pathname === url.pathname;
        } else if (pathname.endsWith("/**")) {
            const slicedPathname = pathname.slice(0, -2);
            return slicedPathname !== url.pathname && url.pathname.startsWith(slicedPathname);
        } else if (pathname.endsWith("/*")) {
            const slicedPathname = pathname.slice(0, -1);
            if (!url.pathname.startsWith(slicedPathname)) {
                return false;
            }
            const additionalPathChunks = url.pathname.slice(slicedPathname.length).split("/").filter(Boolean);
            return additionalPathChunks.length === 1;
        }
        return false;
    }
    isRemoteAllowed = function(src, { domains, remotePatterns }) {
        if (!URL.canParse(src)) {
            return false;
        }
        const url = new URL(src);
        if (![
            "http:",
            "https:",
            "data:"
        ].includes(url.protocol)) {
            return false;
        }
        return domains.some((domain)=>matchHostname(url, domain)) || remotePatterns.some((remotePattern)=>matchPattern(url, remotePattern));
    };
    function getFirstForwardedValue(multiValueHeader) {
        return multiValueHeader?.toString().split(",").map((e)=>e.trim())[0];
    }
    function sanitizeHost(hostname) {
        if (!hostname) return void 0;
        if (/[/\\]/.test(hostname)) return void 0;
        return hostname;
    }
    function parseHost(host) {
        const parts = host.split(":");
        return {
            hostname: parts[0],
            port: parts[1]
        };
    }
    function matchesAllowedDomains(hostname, protocol, port, allowedDomains) {
        const hostWithPort = port ? `${hostname}:${port}` : hostname;
        const urlString = `${protocol}://${hostWithPort}`;
        if (!URL.canParse(urlString)) {
            return false;
        }
        const testUrl = new URL(urlString);
        return allowedDomains.some((pattern)=>matchPattern(testUrl, pattern));
    }
    function validateHost(host, protocol, allowedDomains) {
        if (!host || host.length === 0) return void 0;
        if (!allowedDomains || allowedDomains.length === 0) return void 0;
        const sanitized = sanitizeHost(host);
        if (!sanitized) return void 0;
        const { hostname, port } = parseHost(sanitized);
        if (matchesAllowedDomains(hostname, protocol, port, allowedDomains)) {
            return sanitized;
        }
        return void 0;
    }
    function validateForwardedHeaders(forwardedProtocol, forwardedHost, forwardedPort, allowedDomains) {
        const result = {};
        if (forwardedProtocol) {
            if (allowedDomains && allowedDomains.length > 0) {
                const hasProtocolPatterns = allowedDomains.some((pattern)=>pattern.protocol !== void 0);
                if (hasProtocolPatterns) {
                    try {
                        const testUrl = new URL(`${forwardedProtocol}://example.com`);
                        const isAllowed = allowedDomains.some((pattern)=>matchPattern(testUrl, {
                                protocol: pattern.protocol
                            }));
                        if (isAllowed) {
                            result.protocol = forwardedProtocol;
                        }
                    } catch  {}
                } else if (/^https?$/.test(forwardedProtocol)) {
                    result.protocol = forwardedProtocol;
                }
            }
        }
        if (forwardedPort && allowedDomains && allowedDomains.length > 0) {
            const hasPortPatterns = allowedDomains.some((pattern)=>pattern.port !== void 0);
            if (hasPortPatterns) {
                const isAllowed = allowedDomains.some((pattern)=>pattern.port === forwardedPort);
                if (isAllowed) {
                    result.port = forwardedPort;
                }
            }
        }
        if (forwardedHost && forwardedHost.length > 0 && allowedDomains && allowedDomains.length > 0) {
            const protoForValidation = result.protocol || "https";
            const sanitized = sanitizeHost(forwardedHost);
            if (sanitized) {
                const { hostname, port: portFromHost } = parseHost(sanitized);
                const portForValidation = result.port || portFromHost;
                if (matchesAllowedDomains(hostname, protoForValidation, portForValidation, allowedDomains)) {
                    result.host = sanitized;
                }
            }
        }
        return result;
    }
    class FetchState {
        pipeline;
        request;
        routeData;
        pathname;
        renderOptions;
        timeStart;
        componentInstance;
        slots;
        response;
        status = 200;
        skipMiddleware = false;
        isRewriting = false;
        counter = 0;
        cookies;
        #params;
        get params() {
            if (!this.#params && this.routeData) {
                this.#params = getParams(this.routeData, this.pathname);
            }
            return this.#params;
        }
        set params(value) {
            this.#params = value;
        }
        url;
        clientAddress;
        partial;
        shouldInjectCspMetaTags;
        locals = {};
        props = null;
        actionApiContext = null;
        apiContext = null;
        #providers;
        #providersResolvedValues;
        #componentInstancePromise;
        result;
        initialProps = {};
        #rewrites;
        #astroPagePartial;
        #domainPathname;
        #currentLocale;
        #preferredLocale;
        #preferredLocaleList;
        constructor(pipeline, request, options){
            this.pipeline = pipeline;
            this.request = request;
            options ??= getRenderOptions(request);
            this.routeData = options?.routeData;
            this.renderOptions = options ?? {
                addCookieHeader: false,
                clientAddress: void 0,
                locals: void 0,
                prerenderedErrorPageFetch: fetch,
                routeData: void 0,
                waitUntil: void 0
            };
            this.componentInstance = void 0;
            this.slots = void 0;
            const url = new URL(request.url);
            const domainPathname = computePathnameFromDomain(request, url, pipeline.manifest.i18n, pipeline.manifest.base, pipeline.manifest.trailingSlash, pipeline.logger);
            if (domainPathname) {
                this.#domainPathname = domainPathname;
                try {
                    this.pathname = decodeURI(domainPathname);
                } catch  {
                    this.pathname = domainPathname;
                }
            } else {
                this.pathname = this.#computePathname(url);
            }
            this.timeStart = performance.now();
            this.clientAddress = options?.clientAddress;
            this.locals = options?.locals ?? {};
            this.url = normalizeUrl(url);
            this.cookies = new AstroCookies(request);
            if (pipeline.manifest.allowedDomains && pipeline.manifest.allowedDomains.length > 0) {
                this.#applyForwardedHeaders();
            }
            if (!Reflect.get(request, originPathnameSymbol)) {
                setOriginPathname(request, this.pathname, pipeline.manifest.trailingSlash, pipeline.manifest.buildFormat);
            }
            this.#resolveRouteData();
        }
        rewrite(payload) {
            return (this.#rewrites ??= new Rewrites()).execute(this, payload);
        }
        async createResult(mod, ctx) {
            const pipeline = this.pipeline;
            const { clientDirectives, inlinedScripts, compressHTML, manifest, renderers, resolve } = pipeline;
            const routeData = this.routeData;
            const { links, scripts, styles } = await pipeline.headElements(routeData);
            const extraStyleHashes = [];
            const extraScriptHashes = [];
            const shouldInjectCspMetaTags = this.shouldInjectCspMetaTags ?? manifest.shouldInjectCspMetaTags;
            const cspAlgorithm = manifest.csp?.algorithm ?? "SHA-256";
            if (shouldInjectCspMetaTags) {
                for (const style of styles){
                    extraStyleHashes.push(await generateCspDigest(style.children, cspAlgorithm));
                }
                for (const script of scripts){
                    extraScriptHashes.push(await generateCspDigest(script.children, cspAlgorithm));
                }
            }
            const componentMetadata = await pipeline.componentMetadata(routeData) ?? manifest.componentMetadata;
            const headers = new Headers({
                "Content-Type": "text/html"
            });
            const partial = typeof this.partial === "boolean" ? this.partial : Boolean(mod.partial);
            const actionResult = hasActionPayload(this.locals) ? deserializeActionResult(this.locals._actionPayload.actionResult) : void 0;
            const status = this.status;
            const response = {
                status: actionResult?.error ? actionResult?.error.status : status,
                statusText: actionResult?.error ? actionResult?.error.type : "OK",
                get headers () {
                    return headers;
                },
                set headers (_){
                    throw new AstroError(AstroResponseHeadersReassigned);
                }
            };
            const state = this;
            const result = {
                base: manifest.base,
                userAssetsBase: manifest.userAssetsBase,
                cancelled: false,
                clientDirectives,
                inlinedScripts,
                componentMetadata,
                compressHTML,
                cookies: this.cookies,
                createAstro: (props, slots)=>state.createAstro(result, props, slots, ctx),
                links,
                params: this.params,
                partial,
                pathname: this.pathname,
                renderers,
                resolve,
                response,
                request: this.request,
                scripts,
                styles,
                actionResult,
                async getServerIslandNameMap () {
                    const serverIslands = await pipeline.getServerIslands();
                    return serverIslands.serverIslandNameMap ?? new Map();
                },
                key: manifest.key,
                trailingSlash: manifest.trailingSlash,
                _experimentalQueuedRendering: {
                    pool: pipeline.nodePool,
                    htmlStringCache: pipeline.htmlStringCache,
                    enabled: manifest.experimentalQueuedRendering?.enabled,
                    poolSize: manifest.experimentalQueuedRendering?.poolSize,
                    contentCache: manifest.experimentalQueuedRendering?.contentCache
                },
                _metadata: {
                    hasHydrationScript: false,
                    rendererSpecificHydrationScripts: new Set(),
                    hasRenderedHead: false,
                    renderedScripts: new Set(),
                    hasDirectives: new Set(),
                    hasRenderedServerIslandRuntime: false,
                    headInTree: false,
                    extraHead: [],
                    extraStyleHashes,
                    extraScriptHashes,
                    propagators: new Set(),
                    templateDepth: 0
                },
                cspDestination: manifest.csp?.cspDestination ?? (routeData.prerender ? "meta" : "header"),
                shouldInjectCspMetaTags,
                cspAlgorithm,
                scriptHashes: manifest.csp?.scriptHashes ? [
                    ...manifest.csp.scriptHashes
                ] : [],
                scriptResources: manifest.csp?.scriptResources ? [
                    ...manifest.csp.scriptResources
                ] : [],
                styleHashes: manifest.csp?.styleHashes ? [
                    ...manifest.csp.styleHashes
                ] : [],
                styleResources: manifest.csp?.styleResources ? [
                    ...manifest.csp.styleResources
                ] : [],
                directives: manifest.csp?.directives ? [
                    ...manifest.csp.directives
                ] : [],
                isStrictDynamic: manifest.csp?.isStrictDynamic ?? false,
                internalFetchHeaders: manifest.internalFetchHeaders
            };
            this.result = result;
            return result;
        }
        createAstro(result, props, slotValues, apiContext) {
            let astroPagePartial;
            if (this.isRewriting) {
                this.#astroPagePartial = this.createAstroPagePartial(result, apiContext);
            }
            this.#astroPagePartial ??= this.createAstroPagePartial(result, apiContext);
            astroPagePartial = this.#astroPagePartial;
            const astroComponentPartial = {
                props,
                self: null
            };
            const Astro = Object.assign(Object.create(astroPagePartial), astroComponentPartial);
            let _slots;
            Object.defineProperty(Astro, "slots", {
                get: ()=>{
                    if (!_slots) {
                        _slots = new Slots(result, slotValues, this.pipeline.logger);
                    }
                    return _slots;
                }
            });
            return Astro;
        }
        createAstroPagePartial(result, apiContext) {
            const state = this;
            const { cookies, locals, params, pipeline, url } = this;
            const { response } = result;
            const redirect = (path, status = 302)=>{
                if (state.request[responseSentSymbol$1]) {
                    throw new AstroError({
                        ...ResponseSentError
                    });
                }
                return new Response(null, {
                    status,
                    headers: {
                        Location: path
                    }
                });
            };
            const rewrite = async (reroutePayload)=>{
                return await state.rewrite(reroutePayload);
            };
            const callAction = createCallAction(apiContext);
            const partial = {
                generator: ASTRO_GENERATOR,
                routePattern: this.routeData.route,
                isPrerendered: this.routeData.prerender,
                cookies,
                get clientAddress () {
                    return state.getClientAddress();
                },
                get currentLocale () {
                    return state.computeCurrentLocale();
                },
                params,
                get preferredLocale () {
                    return state.computePreferredLocale();
                },
                get preferredLocaleList () {
                    return state.computePreferredLocaleList();
                },
                locals,
                redirect,
                rewrite,
                request: this.request,
                response,
                site: pipeline.site,
                getActionResult: createGetActionResult(locals),
                get callAction () {
                    return callAction;
                },
                url,
                get originPathname () {
                    return getOriginPathname(state.request);
                },
                get csp () {
                    return state.getCsp();
                },
                get logger () {
                    return {
                        info (msg) {
                            pipeline.logger.info(null, msg);
                        },
                        warn (msg) {
                            pipeline.logger.warn(null, msg);
                        },
                        error (msg) {
                            pipeline.logger.error(null, msg);
                        }
                    };
                }
            };
            this.defineProviderGetters(partial);
            return partial;
        }
        getClientAddress() {
            const { pipeline, clientAddress } = this;
            const routeData = this.routeData;
            if (routeData.prerender) {
                throw new AstroError({
                    ...PrerenderClientAddressNotAvailable,
                    message: PrerenderClientAddressNotAvailable.message(routeData.component)
                });
            }
            if (clientAddress) {
                return clientAddress;
            }
            if (pipeline.adapterName) {
                throw new AstroError({
                    ...ClientAddressNotAvailable,
                    message: ClientAddressNotAvailable.message(pipeline.adapterName)
                });
            }
            throw new AstroError(StaticClientAddressNotAvailable);
        }
        getCookies() {
            return this.cookies;
        }
        getCsp() {
            const state = this;
            const { pipeline } = this;
            if (!pipeline.manifest.csp) {
                if (pipeline.runtimeMode === "production") {
                    pipeline.logger.warn("csp", `context.csp was used when rendering the route ${colors.green(state.routeData.route)}, but CSP was not configured. For more information, see https://docs.astro.build/en/reference/configuration-reference/#securitycsp`);
                }
                return void 0;
            }
            return {
                insertDirective (payload) {
                    if (state.result) {
                        state.result.directives = pushDirective(state.result.directives, payload);
                    }
                },
                insertScriptResource (resource) {
                    state.result?.scriptResources.push(resource);
                },
                insertStyleResource (resource) {
                    state.result?.styleResources.push(resource);
                },
                insertStyleHash (hash) {
                    state.result?.styleHashes.push(hash);
                },
                insertScriptHash (hash) {
                    state.result?.scriptHashes.push(hash);
                }
            };
        }
        computeCurrentLocale() {
            const { url, pipeline: { i18n }, routeData } = this;
            if (!i18n || !routeData) return;
            const { defaultLocale, locales, strategy } = i18n;
            const fallbackTo = strategy === "pathname-prefix-other-locales" || strategy === "domains-prefix-other-locales" ? defaultLocale : void 0;
            if (this.#currentLocale) {
                return this.#currentLocale;
            }
            let computedLocale;
            if (isRouteServerIsland(routeData)) {
                let referer = this.request.headers.get("referer");
                if (referer) {
                    if (URL.canParse(referer)) {
                        referer = new URL(referer).pathname;
                    }
                    computedLocale = computeCurrentLocale(referer, locales, defaultLocale);
                }
            } else {
                let pathname = routeData.pathname;
                if (this.#domainPathname) {
                    pathname = this.pathname;
                } else if (url && !routeData.pattern.test(url.pathname)) {
                    for (const fallbackRoute of routeData.fallbackRoutes){
                        if (fallbackRoute.pattern.test(url.pathname)) {
                            pathname = fallbackRoute.pathname;
                            break;
                        }
                    }
                }
                pathname = pathname && !isRoute404or500(routeData) ? pathname : url.pathname ?? this.pathname;
                computedLocale = computeCurrentLocale(pathname, locales, defaultLocale);
                if (routeData.params.length > 0) {
                    const localeFromParams = computeCurrentLocaleFromParams(this.params, locales);
                    if (localeFromParams) {
                        computedLocale = localeFromParams;
                    }
                }
            }
            this.#currentLocale = computedLocale ?? fallbackTo;
            return this.#currentLocale;
        }
        computePreferredLocale() {
            const { pipeline: { i18n }, request } = this;
            if (!i18n) return;
            return this.#preferredLocale ??= computePreferredLocale(request, i18n.locales);
        }
        computePreferredLocaleList() {
            const { pipeline: { i18n }, request } = this;
            if (!i18n) return;
            return this.#preferredLocaleList ??= computePreferredLocaleList(request, i18n.locales);
        }
        async loadComponentInstance() {
            if (this.componentInstance) return this.componentInstance;
            if (this.#componentInstancePromise) return this.#componentInstancePromise;
            this.#componentInstancePromise = this.pipeline.getComponentByRoute(this.routeData).then((mod)=>{
                this.componentInstance = mod;
                return mod;
            });
            return this.#componentInstancePromise;
        }
        provide(key, provider) {
            (this.#providers ??= new Map()).set(key, provider);
        }
        resolve(key) {
            if (this.#providersResolvedValues?.has(key)) {
                return this.#providersResolvedValues.get(key);
            }
            const provider = this.#providers?.get(key);
            if (!provider) return void 0;
            const value = provider.create();
            (this.#providersResolvedValues ??= new Map()).set(key, value);
            return value;
        }
        finalizeAll() {
            if (!this.#providersResolvedValues || this.#providersResolvedValues.size === 0) return;
            let chain;
            for (const [key, provider] of this.#providers){
                if (provider.finalize && this.#providersResolvedValues.has(key)) {
                    const result = provider.finalize(this.#providersResolvedValues.get(key));
                    if (result) {
                        chain = chain ? chain.then(()=>result) : result;
                    }
                }
            }
            return chain;
        }
        defineProviderGetters(target) {
            if (!this.#providers) return;
            const state = this;
            for (const key of this.#providers.keys()){
                Object.defineProperty(target, key, {
                    get: ()=>state.resolve(key),
                    enumerable: true,
                    configurable: true
                });
            }
        }
        #stripHtmlExtension() {
            if (this.routeData && this.routeData.type === "page" && !routeHasHtmlExtension(this.routeData)) {
                this.pathname = this.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
            }
        }
        #resolveRouteData() {
            const pipeline = this.pipeline;
            if (this.routeData) {
                this.#stripHtmlExtension();
                return;
            }
            const matched = pipeline.matchRoute(this.pathname);
            if (matched && matched.prerender && pipeline.manifest.serverLike) {
                if (matched.params.length > 0) {
                    const allMatches = pipeline.matchAllRoutes(this.pathname);
                    this.routeData = allMatches.find((r)=>!r.prerender);
                } else {
                    this.routeData = void 0;
                }
            } else {
                this.routeData = matched;
            }
            pipeline.logger.debug("router", "Astro matched the following route for " + this.request.url);
            pipeline.logger.debug("router", "RouteData:\n" + this.routeData);
            if (!this.routeData) {
                const custom404 = getCustom404Route(pipeline.manifestData);
                if (custom404 && !custom404.prerender) {
                    this.routeData = custom404;
                }
            }
            if (!this.routeData) {
                pipeline.logger.debug("router", "Astro hasn't found routes that match " + this.request.url);
                pipeline.logger.debug("router", "Here's the available routes:\n", pipeline.manifestData);
                return;
            }
            this.#stripHtmlExtension();
        }
        #computePathname(url) {
            let pathname = collapseDuplicateLeadingSlashes(url.pathname);
            const base = this.pipeline.manifest.base;
            if (pathname.startsWith(base)) {
                const baseWithoutTrailingSlash = removeTrailingForwardSlash(base);
                pathname = pathname.slice(baseWithoutTrailingSlash.length + 1);
            }
            pathname = prependForwardSlash$1(pathname);
            try {
                return decodeURI(pathname);
            } catch (e) {
                this.pipeline.logger.error(null, e.toString());
                return pathname;
            }
        }
        #applyForwardedHeaders() {
            const headers = this.request.headers;
            const allowedDomains = this.pipeline.manifest.allowedDomains;
            const validated = validateForwardedHeaders(getFirstForwardedValue(headers.get("x-forwarded-proto") ?? void 0), getFirstForwardedValue(headers.get("x-forwarded-host") ?? void 0), getFirstForwardedValue(headers.get("x-forwarded-port") ?? void 0), allowedDomains);
            if (!validated.protocol && !validated.host && !validated.port) return;
            if (validated.protocol) {
                this.url.protocol = validated.protocol + ":";
            }
            if (validated.host) {
                const colonIdx = validated.host.indexOf(":");
                if (colonIdx !== -1) {
                    this.url.hostname = validated.host.slice(0, colonIdx);
                    this.url.port = validated.host.slice(colonIdx + 1);
                } else {
                    this.url.hostname = validated.host;
                    this.url.port = "";
                }
            }
            if (validated.port) {
                this.url.port = validated.port;
            }
            const hostTrusted = validated.host !== void 0;
            if (hostTrusted && !this.clientAddress) {
                const forwardedFor = getFirstForwardedValue(this.request.headers.get("x-forwarded-for") ?? void 0);
                if (forwardedFor) {
                    this.clientAddress = forwardedFor;
                }
            }
        }
        async getProps() {
            if (this.props !== null) return this.props;
            if (Object.keys(this.initialProps).length > 0) {
                this.props = this.initialProps;
                return this.props;
            }
            const pipeline = this.pipeline;
            const mod = await this.loadComponentInstance();
            this.props = await getProps({
                mod,
                routeData: this.routeData,
                routeCache: pipeline.routeCache,
                pathname: this.pathname,
                logger: pipeline.logger,
                serverLike: pipeline.manifest.serverLike,
                base: pipeline.manifest.base,
                trailingSlash: pipeline.manifest.trailingSlash
            });
            return this.props;
        }
        getActionAPIContext() {
            if (this.actionApiContext !== null) return this.actionApiContext;
            const state = this;
            const ctx = {
                get cookies () {
                    return state.cookies;
                },
                routePattern: this.routeData.route,
                isPrerendered: this.routeData.prerender,
                get clientAddress () {
                    return state.getClientAddress();
                },
                get currentLocale () {
                    return state.computeCurrentLocale();
                },
                generator: ASTRO_GENERATOR,
                get locals () {
                    return state.locals;
                },
                set locals (_){
                    throw new AstroError(LocalsReassigned);
                },
                params: this.params,
                get preferredLocale () {
                    return state.computePreferredLocale();
                },
                get preferredLocaleList () {
                    return state.computePreferredLocaleList();
                },
                request: this.request,
                site: this.pipeline.site,
                url: this.url,
                get originPathname () {
                    return getOriginPathname(state.request);
                },
                get csp () {
                    return state.getCsp();
                },
                get logger () {
                    if (!state.pipeline.manifest.experimentalLogger) {
                        state.pipeline.logger.warn(null, "The Astro.logger is available only when experimental.logger is defined.");
                        return void 0;
                    }
                    return {
                        info (msg) {
                            state.pipeline.logger.info(null, msg);
                        },
                        warn (msg) {
                            state.pipeline.logger.warn(null, msg);
                        },
                        error (msg) {
                            state.pipeline.logger.error(null, msg);
                        }
                    };
                }
            };
            this.defineProviderGetters(ctx);
            this.actionApiContext = ctx;
            return this.actionApiContext;
        }
        getAPIContext() {
            if (this.apiContext !== null) return this.apiContext;
            const actionApiContext = this.getActionAPIContext();
            const state = this;
            const redirect = (path, status = 302)=>new Response(null, {
                    status,
                    headers: {
                        Location: path
                    }
                });
            const rewrite = async (reroutePayload)=>{
                return await state.rewrite(reroutePayload);
            };
            Reflect.set(actionApiContext, pipelineSymbol, this.pipeline);
            actionApiContext[fetchStateSymbol] = this;
            this.apiContext = Object.assign(actionApiContext, {
                props: this.props,
                redirect,
                rewrite,
                getActionResult: createGetActionResult(actionApiContext.locals),
                callAction: createCallAction(actionApiContext)
            });
            return this.apiContext;
        }
        invalidateContexts() {
            this.props = null;
            this.actionApiContext = null;
            this.apiContext = null;
        }
    }
    class ActionHandler {
        handle(apiContext, state) {
            state.pipeline.usedFeatures |= PipelineFeatures.actions;
            if (apiContext.isPrerendered) {
                return void 0;
            }
            const { action, setActionResult } = getActionContext(apiContext);
            if (!action) {
                return void 0;
            }
            return this.#executeAction(action, setActionResult);
        }
        async #executeAction(action, setActionResult) {
            const actionResult = await action.handler();
            const serialized = serializeActionResult(actionResult);
            if (action.calledFrom === "rpc") {
                if (serialized.type === "empty") {
                    return new Response(null, {
                        status: serialized.status
                    });
                }
                return new Response(serialized.body, {
                    status: serialized.status,
                    headers: {
                        "Content-Type": serialized.contentType
                    }
                });
            }
            setActionResult(action.name, serialized);
            return void 0;
        }
    }
    function prepareResponse(response, { addCookieHeader }) {
        for (const headerName of INTERNAL_RESPONSE_HEADERS){
            if (response.headers.has(headerName)) {
                response.headers.delete(headerName);
            }
        }
        if (addCookieHeader) {
            for (const setCookieHeaderValue of getSetCookiesFromResponse(response)){
                response.headers.append("set-cookie", setCookieHeaderValue);
            }
        }
        Reflect.set(response, responseSentSymbol$1, true);
    }
    function redirectTemplate({ status, absoluteLocation, relativeLocation, from }) {
        const delay = status === 302 ? 2 : 0;
        const rel = escape(String(relativeLocation));
        const abs = escape(String(absoluteLocation));
        const fromHtml = from ? `from <code>${escape(from)}</code> ` : "";
        return `<!doctype html>
<title>Redirecting to: ${rel}</title>
<meta http-equiv="refresh" content="${delay};url=${rel}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${abs}">
<body>
	<a href="${rel}">Redirecting ${fromHtml}to <code>${rel}</code></a>
</body>`;
    }
    class TrailingSlashHandler {
        #app;
        constructor(app){
            this.#app = app;
        }
        handle(state) {
            const url = new URL(state.request.url);
            const redirect = this.#redirectTrailingSlash(url.pathname);
            if (redirect === url.pathname) {
                return void 0;
            }
            const addCookieHeader = state.renderOptions.addCookieHeader;
            const status = state.request.method === "GET" ? 301 : 308;
            const response = new Response(redirectTemplate({
                status,
                relativeLocation: url.pathname,
                absoluteLocation: redirect,
                from: state.request.url
            }), {
                status,
                headers: {
                    location: redirect + url.search
                }
            });
            prepareResponse(response, {
                addCookieHeader
            });
            return response;
        }
        #redirectTrailingSlash(pathname) {
            const { trailingSlash } = this.#app.manifest;
            if (pathname === "/" || isInternalPath(pathname)) {
                return pathname;
            }
            const path = collapseDuplicateTrailingSlashes(pathname, trailingSlash !== "never");
            if (path !== pathname) {
                return path;
            }
            if (trailingSlash === "ignore") {
                return pathname;
            }
            if (trailingSlash === "always" && !hasFileExtension(pathname)) {
                return appendForwardSlash(pathname);
            }
            if (trailingSlash === "never") {
                return removeTrailingForwardSlash(pathname);
            }
            return pathname;
        }
    }
    function defaultSetHeaders(options) {
        const headers = new Headers();
        const directives = [];
        if (options.maxAge !== void 0) {
            directives.push(`max-age=${options.maxAge}`);
        }
        if (options.swr !== void 0) {
            directives.push(`stale-while-revalidate=${options.swr}`);
        }
        if (directives.length > 0) {
            headers.set("CDN-Cache-Control", directives.join(", "));
        }
        if (options.tags && options.tags.length > 0) {
            headers.set("Cache-Tag", options.tags.join(", "));
        }
        if (options.lastModified) {
            headers.set("Last-Modified", options.lastModified.toUTCString());
        }
        if (options.etag) {
            headers.set("ETag", options.etag);
        }
        return headers;
    }
    function isLiveDataEntry(value) {
        return value != null && typeof value === "object" && "id" in value && "data" in value && "cacheHint" in value;
    }
    const APPLY_HEADERS = Symbol.for("astro:cache:apply");
    const IS_ACTIVE = Symbol.for("astro:cache:active");
    class AstroCache {
        #options = {};
        #tags = new Set();
        #disabled = false;
        #provider;
        enabled = true;
        constructor(provider){
            this.#provider = provider;
        }
        set(input) {
            if (input === false) {
                this.#disabled = true;
                this.#tags.clear();
                this.#options = {};
                return;
            }
            this.#disabled = false;
            let options;
            if (isLiveDataEntry(input)) {
                if (!input.cacheHint) return;
                options = input.cacheHint;
            } else {
                options = input;
            }
            if ("maxAge" in options && options.maxAge !== void 0) this.#options.maxAge = options.maxAge;
            if ("swr" in options && options.swr !== void 0) this.#options.swr = options.swr;
            if ("etag" in options && options.etag !== void 0) this.#options.etag = options.etag;
            if (options.lastModified !== void 0) {
                if (!this.#options.lastModified || options.lastModified > this.#options.lastModified) {
                    this.#options.lastModified = options.lastModified;
                }
            }
            if (options.tags) {
                for (const tag of options.tags)this.#tags.add(tag);
            }
        }
        get tags() {
            return [
                ...this.#tags
            ];
        }
        get options() {
            return {
                ...this.#options,
                tags: this.tags
            };
        }
        async invalidate(input) {
            if (!this.#provider) {
                throw new AstroError(CacheNotEnabled);
            }
            let options;
            if (isLiveDataEntry(input)) {
                options = {
                    tags: input.cacheHint?.tags ?? []
                };
            } else {
                options = input;
            }
            return this.#provider.invalidate(options);
        }
        [APPLY_HEADERS](response) {
            if (this.#disabled) return;
            const finalOptions = {
                ...this.#options,
                tags: this.tags
            };
            if (finalOptions.maxAge === void 0 && !finalOptions.tags?.length) return;
            const headers = this.#provider?.setHeaders?.(finalOptions) ?? defaultSetHeaders(finalOptions);
            for (const [key, value] of headers){
                response.headers.set(key, value);
            }
        }
        get [IS_ACTIVE]() {
            return !this.#disabled && (this.#options.maxAge !== void 0 || this.#tags.size > 0);
        }
    }
    function applyCacheHeaders(cache, response) {
        if (APPLY_HEADERS in cache) {
            cache[APPLY_HEADERS](response);
        }
    }
    const ROUTE_DYNAMIC_SPLIT = /\[(.+?\(.+?\)|.+?)\]/;
    const ROUTE_SPREAD = /^\.{3}.+$/;
    function getParts(part, file) {
        const result = [];
        part.split(ROUTE_DYNAMIC_SPLIT).map((str, i)=>{
            if (!str) return;
            const dynamic = i % 2 === 1;
            const [, content] = dynamic ? /([^(]+)$/.exec(str) || [
                null,
                null
            ] : [
                null,
                str
            ];
            if (!content || dynamic && !/^(?:\.\.\.)?[\w$]+$/.test(content)) {
                throw new Error(`Invalid route ${file} \u2014 parameter name must match /^[a-zA-Z0-9_$]+$/`);
            }
            result.push({
                content,
                dynamic,
                spread: dynamic && ROUTE_SPREAD.test(content)
            });
        });
        return result;
    }
    function compileCacheRoutes(routes, base, trailingSlash) {
        const compiled = Object.entries(routes).map(([path, options])=>{
            const segments = removeLeadingForwardSlash(path).split("/").filter(Boolean).map((s)=>getParts(s, path));
            const pattern = getPattern(segments, base, trailingSlash);
            return {
                pattern,
                options,
                segments,
                route: path
            };
        });
        compiled.sort((a, b)=>routeComparator({
                segments: a.segments,
                route: a.route,
                type: "page"
            }, {
                segments: b.segments,
                route: b.route,
                type: "page"
            }));
        return compiled;
    }
    function matchCacheRoute(pathname, compiledRoutes) {
        for (const route of compiledRoutes){
            if (route.pattern.test(pathname)) return route.options;
        }
        return null;
    }
    const CACHE_KEY = "cache";
    function provideCache(state) {
        const pipeline = state.pipeline;
        if (!pipeline.cacheConfig) {
            state.provide(CACHE_KEY, {
                create: ()=>new DisabledAstroCache(pipeline.logger)
            });
            return;
        }
        if (pipeline.runtimeMode === "development") {
            state.provide(CACHE_KEY, {
                create: ()=>new NoopAstroCache()
            });
            return;
        }
        return provideCacheAsync(state, pipeline);
    }
    async function provideCacheAsync(state, pipeline) {
        const cacheProvider = await pipeline.getCacheProvider();
        state.provide(CACHE_KEY, {
            create () {
                const cache = new AstroCache(cacheProvider);
                if (pipeline.cacheConfig?.routes) {
                    if (!pipeline.compiledCacheRoutes) {
                        pipeline.compiledCacheRoutes = compileCacheRoutes(pipeline.cacheConfig.routes, pipeline.manifest.base, pipeline.manifest.trailingSlash);
                    }
                    const matched = matchCacheRoute(state.pathname, pipeline.compiledCacheRoutes);
                    if (matched) {
                        cache.set(matched);
                    }
                }
                return cache;
            }
        });
    }
    class CacheHandler {
        #app;
        constructor(app){
            this.#app = app;
        }
        async handle(state, next) {
            this.#app.pipeline.usedFeatures |= PipelineFeatures.cache;
            if (!this.#app.pipeline.cacheProvider) {
                return next();
            }
            const cache = state.resolve(CACHE_KEY);
            const cacheProvider = await this.#app.pipeline.getCacheProvider();
            if (cacheProvider?.onRequest) {
                const response2 = await cacheProvider.onRequest({
                    request: state.request,
                    url: new URL(state.request.url),
                    waitUntil: state.renderOptions.waitUntil
                }, async ()=>{
                    const res = await next();
                    applyCacheHeaders(cache, res);
                    return res;
                });
                response2.headers.delete("CDN-Cache-Control");
                response2.headers.delete("Cache-Tag");
                return response2;
            }
            const response = await next();
            applyCacheHeaders(cache, response);
            return response;
        }
    }
    function isExternalURL(url) {
        return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("//");
    }
    function redirectIsExternal(redirect) {
        if (typeof redirect === "string") {
            return isExternalURL(redirect);
        } else {
            return isExternalURL(redirect.destination);
        }
    }
    function computeRedirectStatus(method, redirect, redirectRoute) {
        return redirectRoute && typeof redirect === "object" ? redirect.status : method === "GET" ? 301 : 308;
    }
    function resolveRedirectTarget(params, redirect, redirectRoute, trailingSlash) {
        if (typeof redirectRoute !== "undefined") {
            const generate = getRouteGenerator(redirectRoute.segments, trailingSlash);
            return generate(params);
        } else if (typeof redirect === "string") {
            if (redirectIsExternal(redirect)) {
                return redirect;
            } else {
                let target = redirect;
                for (const param of Object.keys(params)){
                    const paramValue = params[param];
                    target = target.replace(`[${param}]`, paramValue).replace(`[...${param}]`, paramValue);
                }
                return target;
            }
        } else if (typeof redirect === "undefined") {
            return "/";
        }
        return redirect.destination;
    }
    async function renderRedirect(state) {
        state.pipeline.usedFeatures |= PipelineFeatures.redirects;
        const routeData = state.routeData;
        const { redirect, redirectRoute } = routeData;
        const status = computeRedirectStatus(state.request.method, redirect, redirectRoute);
        const headers = {
            location: encodeURI(resolveRedirectTarget(state.params, redirect, redirectRoute, state.pipeline.manifest.trailingSlash))
        };
        if (redirect && redirectIsExternal(redirect)) {
            if (typeof redirect === "string") {
                return Response.redirect(redirect, status);
            } else {
                return Response.redirect(redirect.destination, status);
            }
        }
        return new Response(null, {
            status,
            headers
        });
    }
    const PERSIST_SYMBOL = Symbol();
    const DEFAULT_COOKIE_NAME = "astro-session";
    const VALID_COOKIE_REGEX = /^[\w-]+$/;
    const unflatten = (parsed, _)=>{
        return unflatten$1(parsed, {
            URL: (href)=>new URL(href)
        });
    };
    const stringify = (data, _)=>{
        return stringify$1(data, {
            URL: (val)=>val instanceof URL && val.href
        });
    };
    class AstroSession {
        #cookies;
        #config;
        #cookieConfig;
        #cookieName;
        #storage;
        #data;
        #sessionID;
        #toDestroy = new Set();
        #toDelete = new Set();
        #dirty = false;
        #cookieSet = false;
        #sessionIDFromCookie = false;
        #partial = true;
        #driverFactory;
        static #sharedStorage = new Map();
        constructor({ cookies, config, runtimeMode, driverFactory, mockStorage }){
            if (!config) {
                throw new AstroError({
                    ...SessionStorageInitError,
                    message: SessionStorageInitError.message("No driver was defined in the session configuration and the adapter did not provide a default driver.")
                });
            }
            this.#cookies = cookies;
            this.#driverFactory = driverFactory;
            const { cookie: cookieConfig = DEFAULT_COOKIE_NAME, ...configRest } = config;
            let cookieConfigObject;
            if (typeof cookieConfig === "object") {
                const { name = DEFAULT_COOKIE_NAME, ...rest } = cookieConfig;
                this.#cookieName = name;
                cookieConfigObject = rest;
            } else {
                this.#cookieName = cookieConfig || DEFAULT_COOKIE_NAME;
            }
            this.#cookieConfig = {
                sameSite: "lax",
                secure: runtimeMode === "production",
                path: "/",
                ...cookieConfigObject,
                httpOnly: true
            };
            this.#config = configRest;
            if (mockStorage) {
                this.#storage = mockStorage;
            }
        }
        async get(key) {
            return (await this.#ensureData()).get(key)?.data;
        }
        async has(key) {
            return (await this.#ensureData()).has(key);
        }
        async keys() {
            return (await this.#ensureData()).keys();
        }
        async values() {
            return [
                ...(await this.#ensureData()).values()
            ].map((entry)=>entry.data);
        }
        async entries() {
            return [
                ...(await this.#ensureData()).entries()
            ].map(([key, entry])=>[
                    key,
                    entry.data
                ]);
        }
        delete(key) {
            this.#data ??= new Map();
            this.#data.delete(key);
            if (this.#partial) {
                this.#toDelete.add(key);
            }
            this.#dirty = true;
        }
        set(key, value, { ttl } = {}) {
            if (!key) {
                throw new AstroError({
                    ...SessionStorageSaveError,
                    message: "The session key was not provided."
                });
            }
            let cloned;
            try {
                cloned = unflatten(JSON.parse(stringify(value)));
            } catch (err) {
                throw new AstroError({
                    ...SessionStorageSaveError,
                    message: `The session data for ${key} could not be serialized.`,
                    hint: "See the devalue library for all supported types: https://github.com/rich-harris/devalue"
                }, {
                    cause: err
                });
            }
            if (!this.#cookieSet) {
                this.#setCookie();
                this.#cookieSet = true;
            }
            this.#data ??= new Map();
            const lifetime = ttl ?? this.#config.ttl;
            const expires = typeof lifetime === "number" ? Date.now() + lifetime * 1e3 : lifetime;
            this.#data.set(key, {
                data: cloned,
                expires
            });
            this.#dirty = true;
        }
        destroy() {
            const sessionId = this.#sessionID ?? this.#cookies.get(this.#cookieName)?.value;
            if (sessionId) {
                this.#toDestroy.add(sessionId);
            }
            this.#cookies.delete(this.#cookieName, this.#cookieConfig);
            this.#sessionID = void 0;
            this.#data = void 0;
            this.#dirty = true;
        }
        async regenerate() {
            let data = new Map();
            try {
                data = await this.#ensureData();
            } catch (err) {
                console.error("Failed to load session data during regeneration:", err);
            }
            const oldSessionId = this.#sessionID;
            this.#sessionID = crypto.randomUUID();
            this.#sessionIDFromCookie = false;
            this.#data = data;
            this.#dirty = true;
            await this.#setCookie();
            if (oldSessionId && this.#storage) {
                this.#storage.removeItem(oldSessionId).catch((err)=>{
                    console.error("Failed to remove old session data:", err);
                });
            }
        }
        async [PERSIST_SYMBOL]() {
            if (!this.#dirty && !this.#toDestroy.size) {
                return;
            }
            const storage = await this.#ensureStorage();
            if (this.#dirty && this.#data) {
                const data = await this.#ensureData();
                this.#toDelete.forEach((key2)=>data.delete(key2));
                const key = this.#ensureSessionID();
                let serialized;
                try {
                    serialized = stringify(data);
                } catch (err) {
                    throw new AstroError({
                        ...SessionStorageSaveError,
                        message: SessionStorageSaveError.message("The session data could not be serialized.", this.#config.driver)
                    }, {
                        cause: err
                    });
                }
                await storage.setItem(key, serialized);
                this.#dirty = false;
            }
            if (this.#toDestroy.size > 0) {
                const cleanupPromises = [
                    ...this.#toDestroy
                ].map((sessionId)=>storage.removeItem(sessionId).catch((err)=>{
                        console.error("Failed to clean up session %s:", sessionId, err);
                    }));
                await Promise.all(cleanupPromises);
                this.#toDestroy.clear();
            }
        }
        get sessionID() {
            return this.#sessionID;
        }
        async load(sessionID) {
            this.#sessionID = sessionID;
            this.#data = void 0;
            await this.#setCookie();
            await this.#ensureData();
        }
        async #setCookie() {
            if (!VALID_COOKIE_REGEX.test(this.#cookieName)) {
                throw new AstroError({
                    ...SessionStorageSaveError,
                    message: "Invalid cookie name. Cookie names can only contain letters, numbers, and dashes."
                });
            }
            const value = this.#ensureSessionID();
            this.#cookies.set(this.#cookieName, value, this.#cookieConfig);
        }
        async #ensureData() {
            if (this.#data && !this.#partial) {
                return this.#data;
            }
            this.#data ??= new Map();
            if (!this.#sessionID && !this.#cookies.get(this.#cookieName)?.value) {
                this.#partial = false;
                return this.#data;
            }
            const storage = await this.#ensureStorage();
            const raw = await storage.get(this.#ensureSessionID());
            if (!raw) {
                if (this.#sessionIDFromCookie) {
                    this.#sessionID = crypto.randomUUID();
                    this.#sessionIDFromCookie = false;
                    if (this.#cookieSet) {
                        await this.#setCookie();
                    }
                }
                return this.#data;
            }
            try {
                const storedMap = unflatten(raw);
                if (!(storedMap instanceof Map)) {
                    await this.destroy();
                    throw new AstroError({
                        ...SessionStorageInitError,
                        message: SessionStorageInitError.message("The session data was an invalid type.", this.#config.driver)
                    });
                }
                const now = Date.now();
                for (const [key, value] of storedMap){
                    const expired = typeof value.expires === "number" && value.expires < now;
                    if (!this.#data.has(key) && !this.#toDelete.has(key) && !expired) {
                        this.#data.set(key, value);
                    }
                }
                this.#partial = false;
                return this.#data;
            } catch (err) {
                await this.destroy();
                if (err instanceof AstroError) {
                    throw err;
                }
                throw new AstroError({
                    ...SessionStorageInitError,
                    message: SessionStorageInitError.message("The session data could not be parsed.", this.#config.driver)
                }, {
                    cause: err
                });
            }
        }
        #ensureSessionID() {
            if (!this.#sessionID) {
                const cookieValue = this.#cookies.get(this.#cookieName)?.value;
                if (cookieValue) {
                    this.#sessionID = cookieValue;
                    this.#sessionIDFromCookie = true;
                } else {
                    this.#sessionID = crypto.randomUUID();
                }
            }
            return this.#sessionID;
        }
        async #ensureStorage() {
            if (this.#storage) {
                return this.#storage;
            }
            if (AstroSession.#sharedStorage.has(this.#config.driver)) {
                this.#storage = AstroSession.#sharedStorage.get(this.#config.driver);
                return this.#storage;
            }
            if (!this.#driverFactory) {
                throw new AstroError({
                    ...SessionStorageInitError,
                    message: SessionStorageInitError.message("Astro could not load the driver correctly. Does it exist?", this.#config.driver)
                });
            }
            const driver = this.#driverFactory;
            try {
                this.#storage = createStorage({
                    driver: {
                        ...driver(this.#config.options),
                        hasItem () {
                            return false;
                        },
                        getKeys () {
                            return [];
                        }
                    }
                });
                AstroSession.#sharedStorage.set(this.#config.driver, this.#storage);
                return this.#storage;
            } catch (err) {
                throw new AstroError({
                    ...SessionStorageInitError,
                    message: SessionStorageInitError.message("Unknown error", this.#config.driver)
                }, {
                    cause: err
                });
            }
        }
    }
    const SESSION_KEY = "session";
    function provideSession(state) {
        state.pipeline.usedFeatures |= PipelineFeatures.sessions;
        const pipeline = state.pipeline;
        const config = pipeline.manifest.sessionConfig;
        if (!config) return;
        return provideSessionAsync(state, config);
    }
    async function provideSessionAsync(state, config) {
        const pipeline = state.pipeline;
        const driverFactory = await pipeline.getSessionDriver();
        if (!driverFactory) return;
        state.provide(SESSION_KEY, {
            create () {
                const cookies = state.cookies;
                return new AstroSession({
                    cookies,
                    config,
                    runtimeMode: pipeline.runtimeMode,
                    driverFactory,
                    mockStorage: null
                });
            },
            finalize (session) {
                return session[PERSIST_SYMBOL]();
            }
        });
    }
    class AstroHandler {
        #app;
        #trailingSlashHandler;
        #actionHandler;
        #astroMiddleware;
        #pagesHandler;
        #cacheHandler;
        #renderRouteCallback;
        #i18n;
        #hasSession;
        constructor(app){
            this.#app = app;
            this.#trailingSlashHandler = new TrailingSlashHandler(app);
            this.#actionHandler = new ActionHandler();
            this.#astroMiddleware = new AstroMiddleware(app.pipeline);
            this.#pagesHandler = new PagesHandler(app.pipeline);
            this.#cacheHandler = new CacheHandler(app);
            this.#renderRouteCallback = this.#actionsAndPages.bind(this);
            this.#hasSession = !!app.manifest.sessionConfig;
            const i18n = app.manifest.i18n;
            if (i18n && i18n.strategy !== "manual") {
                this.#i18n = new I18n(i18n, app.manifest.base, app.manifest.trailingSlash, app.manifest.buildFormat);
            }
        }
        #actionsAndPages(state, ctx) {
            if (!state.skipMiddleware) {
                const actionResult = this.#actionHandler.handle(ctx, state);
                if (actionResult) {
                    return actionResult.then((response)=>response ?? this.#pagesHandler.handle(state, ctx));
                }
            }
            return this.#pagesHandler.handle(state, ctx);
        }
        async handle(state) {
            state.pipeline.usedFeatures |= ALL_PIPELINE_FEATURES;
            const trailingSlashRedirect = this.#trailingSlashHandler.handle(state);
            if (trailingSlashRedirect) {
                return trailingSlashRedirect;
            }
            if (!state.routeData) {
                return this.#app.renderError(state.request, {
                    ...state.renderOptions,
                    status: 404,
                    pathname: state.pathname
                });
            }
            return this.render(state);
        }
        async render(state) {
            const routeData = state.routeData;
            const pathname = state.pathname;
            const request = state.request;
            const { addCookieHeader } = state.renderOptions;
            const defaultStatus = this.#app.getDefaultStatusCode(routeData, pathname);
            state.status = defaultStatus;
            let response;
            try {
                const sessionP = this.#hasSession ? provideSession(state) : void 0;
                const cacheP = provideCache(state);
                if (sessionP || cacheP) await Promise.all([
                    sessionP,
                    cacheP
                ]);
                state.pipeline.usedFeatures |= PipelineFeatures.sessions;
                if (routeData.type === "redirect") {
                    const redirectResponse = await renderRedirect(state);
                    this.#app.logThisRequest({
                        pathname,
                        method: request.method,
                        statusCode: redirectResponse.status,
                        isRewrite: false,
                        timeStart: state.timeStart
                    });
                    prepareResponse(redirectResponse, {
                        addCookieHeader
                    });
                    this.#app.pipeline.logger.flush();
                    return redirectResponse;
                }
                if (!this.#app.pipeline.cacheProvider) {
                    this.#app.pipeline.usedFeatures |= PipelineFeatures.cache;
                    response = await this.#astroMiddleware.handle(state, this.#renderRouteCallback);
                    if (this.#i18n) {
                        response = await this.#i18n.finalize(state, response);
                    }
                } else {
                    const runPipeline = async ()=>{
                        let res = await this.#astroMiddleware.handle(state, this.#renderRouteCallback);
                        if (this.#i18n) {
                            res = await this.#i18n.finalize(state, res);
                        }
                        return res;
                    };
                    response = await this.#cacheHandler.handle(state, runPipeline);
                }
                const isRewrite = response.headers.has(REWRITE_DIRECTIVE_HEADER_KEY);
                this.#app.logThisRequest({
                    pathname,
                    method: request.method,
                    statusCode: response.status,
                    isRewrite,
                    timeStart: state.timeStart
                });
            } catch (err) {
                this.#app.logger.error(null, err.stack || err.message || String(err));
                return this.#app.renderError(request, {
                    ...state.renderOptions,
                    status: 500,
                    error: err,
                    pathname: state.pathname
                });
            } finally{
                const finalize = state.finalizeAll();
                if (finalize) await finalize;
            }
            if (REROUTABLE_STATUS_CODES.includes(response.status) && response.body === null && response.headers.get(REROUTE_DIRECTIVE_HEADER) !== "no") {
                return this.#app.renderError(request, {
                    ...state.renderOptions,
                    response,
                    status: response.status,
                    error: response.status === 500 ? null : void 0,
                    pathname: state.pathname
                });
            }
            prepareResponse(response, {
                addCookieHeader
            });
            this.#app.pipeline.logger.flush();
            return response;
        }
    }
    class DefaultFetchHandler {
        #app;
        #handler;
        constructor(app){
            this.#app = app ?? null;
            this.#handler = app ? new AstroHandler(app) : null;
        }
        renderWithOptions(request, options) {
            if (!this.#app) {
                const app = Reflect.get(request, appSymbol);
                if (!app) {
                    throw new Error("No fetch handler provided.");
                }
                this.#app = app;
                this.#handler = new AstroHandler(app);
            }
            const state = new FetchState(this.#app.pipeline, request, options);
            return this.#handler.handle(state);
        }
        fetch = (request)=>{
            if (!this.#app) {
                const app = Reflect.get(request, appSymbol);
                if (!app) {
                    throw new Error("No fetch handler provided.");
                }
                this.#app = app;
                this.#handler = new AstroHandler(app);
            }
            const state = new FetchState(this.#app.pipeline, request);
            if (!this.#handler) {
                throw new Error("No fetch handler provided.");
            }
            return this.#handler.handle(state);
        };
    }
    const fetchable = new DefaultFetchHandler();
    class DefaultErrorHandler {
        #app;
        #astroMiddleware;
        #pagesHandler;
        constructor(app){
            this.#app = app;
            this.#astroMiddleware = new AstroMiddleware(app.pipeline);
            this.#pagesHandler = new PagesHandler(app.pipeline);
        }
        async renderError(request, { status, response: originalResponse, skipMiddleware = false, error, pathname, ...resolvedRenderOptions }) {
            const app = this.#app;
            const resolvedPathname = pathname ?? new FetchState(app.pipeline, request).pathname;
            const errorRoutePath = `/${status}${app.manifest.trailingSlash === "always" ? "/" : ""}`;
            const errorRouteData = matchRoute(errorRoutePath, app.manifestData);
            const url = new URL(request.url);
            if (errorRouteData) {
                if (errorRouteData.prerender) {
                    const maybeDotHtml = errorRouteData.route.endsWith(`/${status}`) ? ".html" : "";
                    const statusURL = new URL(`${app.baseWithoutTrailingSlash}/${status}${maybeDotHtml}`, url);
                    if (statusURL.toString() !== request.url && resolvedRenderOptions.prerenderedErrorPageFetch) {
                        const response2 = await resolvedRenderOptions.prerenderedErrorPageFetch(statusURL.toString());
                        const override = {
                            status,
                            removeContentEncodingHeaders: true
                        };
                        const newResponse = mergeResponses(response2, originalResponse, override);
                        prepareResponse(newResponse, resolvedRenderOptions);
                        return newResponse;
                    }
                }
                const mod = await app.pipeline.getComponentByRoute(errorRouteData);
                const errorState = new FetchState(app.pipeline, request);
                errorState.skipMiddleware = skipMiddleware;
                errorState.clientAddress = resolvedRenderOptions.clientAddress;
                errorState.routeData = errorRouteData;
                errorState.pathname = resolvedPathname;
                errorState.status = status;
                errorState.componentInstance = mod;
                errorState.locals = resolvedRenderOptions.locals ?? {};
                errorState.initialProps = {
                    error
                };
                try {
                    await provideSession(errorState);
                    const response2 = await this.#astroMiddleware.handle(errorState, this.#pagesHandler.handle.bind(this.#pagesHandler));
                    const newResponse = mergeResponses(response2, originalResponse);
                    prepareResponse(newResponse, resolvedRenderOptions);
                    return newResponse;
                } catch  {
                    if (skipMiddleware === false) {
                        return this.renderError(request, {
                            ...resolvedRenderOptions,
                            status,
                            response: originalResponse,
                            skipMiddleware: true,
                            pathname: resolvedPathname
                        });
                    }
                } finally{
                    await errorState.finalizeAll();
                }
            }
            const response = mergeResponses(new Response(null, {
                status
            }), originalResponse);
            prepareResponse(response, resolvedRenderOptions);
            return response;
        }
    }
    function mergeResponses(newResponse, originalResponse, override) {
        let newResponseHeaders = newResponse.headers;
        if (override?.removeContentEncodingHeaders) {
            newResponseHeaders = new Headers(newResponseHeaders);
            newResponseHeaders.delete("Content-Encoding");
            newResponseHeaders.delete("Content-Length");
        }
        if (!originalResponse) {
            if (override !== void 0) {
                return new Response(newResponse.body, {
                    status: override.status,
                    statusText: newResponse.statusText,
                    headers: newResponseHeaders
                });
            }
            return newResponse;
        }
        const status = override?.status ? override.status : originalResponse.status === 200 ? newResponse.status : originalResponse.status;
        try {
            originalResponse.headers.delete("Content-type");
            originalResponse.headers.delete("Content-Length");
            originalResponse.headers.delete("Transfer-Encoding");
        } catch  {}
        const newHeaders = new Headers();
        const seen = new Set();
        for (const [name, value] of originalResponse.headers){
            newHeaders.append(name, value);
            seen.add(name.toLowerCase());
        }
        for (const [name, value] of newResponseHeaders){
            if (!seen.has(name.toLowerCase())) {
                newHeaders.append(name, value);
            }
        }
        const mergedResponse = new Response(newResponse.body, {
            status,
            statusText: status === 200 ? newResponse.statusText : originalResponse.statusText,
            headers: newHeaders
        });
        const originalCookies = getCookiesFromResponse(originalResponse);
        const newCookies = getCookiesFromResponse(newResponse);
        if (originalCookies) {
            if (newCookies) {
                for (const cookieValue of newCookies.consume()){
                    originalResponse.headers.append("set-cookie", cookieValue);
                }
            }
            attachCookiesToResponse(mergedResponse, originalCookies);
        } else if (newCookies) {
            attachCookiesToResponse(mergedResponse, newCookies);
        }
        return mergedResponse;
    }
    class BaseApp {
        manifest;
        manifestData;
        pipeline;
        #adapterLogger;
        baseWithoutTrailingSlash;
        #fetchHandler;
        #errorHandler;
        #hasCustomFetchHandler = false;
        #featureCheckDone = false;
        get logger() {
            return this.pipeline.logger;
        }
        get adapterLogger() {
            if (!this.#adapterLogger) {
                this.#adapterLogger = new AstroIntegrationLogger(this.logger.options, this.manifest.adapterName);
            }
            return this.#adapterLogger;
        }
        constructor(manifest, streaming = true, ...args){
            this.manifest = manifest;
            this.baseWithoutTrailingSlash = removeTrailingForwardSlash(manifest.base);
            this.pipeline = this.createPipeline(streaming, manifest, ...args);
            this.manifestData = this.pipeline.manifestData;
            this.#fetchHandler = new DefaultFetchHandler(this);
            this.#errorHandler = this.createErrorHandler();
        }
        setFetchHandler(handler) {
            this.#fetchHandler = handler;
            this.#hasCustomFetchHandler = !(handler instanceof DefaultFetchHandler);
        }
        createErrorHandler() {
            return new DefaultErrorHandler(this);
        }
        resetAdapterLogger() {
            this.#adapterLogger = void 0;
        }
        getAllowedDomains() {
            return this.manifest.allowedDomains;
        }
        matchesAllowedDomains(forwardedHost, protocol) {
            return BaseApp.validateForwardedHost(forwardedHost, this.manifest.allowedDomains, protocol);
        }
        static validateForwardedHost(forwardedHost, allowedDomains, protocol) {
            if (!allowedDomains || allowedDomains.length === 0) {
                return false;
            }
            try {
                const testUrl = new URL(`${protocol || "https"}://${forwardedHost}`);
                return allowedDomains.some((pattern)=>{
                    return matchPattern(testUrl, pattern);
                });
            } catch  {
                return false;
            }
        }
        set setManifestData(newManifestData) {
            this.manifestData = newManifestData;
            this.pipeline.manifestData = newManifestData;
            this.pipeline.rebuildRouter();
        }
        removeBase(pathname) {
            pathname = collapseDuplicateLeadingSlashes(pathname);
            if (pathname.startsWith(this.manifest.base)) {
                return pathname.slice(this.baseWithoutTrailingSlash.length + 1);
            }
            return pathname;
        }
        safeDecodeURI(pathname) {
            try {
                return decodeURI(pathname);
            } catch (e) {
                this.adapterLogger.debug(e.toString());
                return pathname;
            }
        }
        getPathnameFromRequest(request) {
            const url = new URL(request.url);
            const pathname = prependForwardSlash$1(this.removeBase(url.pathname));
            return this.safeDecodeURI(pathname);
        }
        match(request, allowPrerenderedRoutes = false) {
            const url = new URL(request.url);
            if (this.manifest.assets.has(url.pathname)) return void 0;
            let pathname = this.computePathnameFromDomain(request);
            if (!pathname) {
                pathname = prependForwardSlash$1(this.removeBase(url.pathname));
            }
            const routeData = this.pipeline.matchRoute(this.safeDecodeURI(pathname));
            if (!routeData) return void 0;
            if (allowPrerenderedRoutes) {
                return routeData;
            }
            if (routeData.prerender) {
                if (routeData.params.length > 0) {
                    const allMatches = this.pipeline.matchAllRoutes(this.safeDecodeURI(pathname));
                    return allMatches.find((r)=>!r.prerender);
                }
                return void 0;
            }
            return routeData;
        }
        devMatch(pathname) {
            return void 0;
        }
        computePathnameFromDomain(request) {
            return computePathnameFromDomain(request, new URL(request.url), this.manifest.i18n, this.manifest.base, this.manifest.trailingSlash, this.logger);
        }
        async render(request, { addCookieHeader = false, clientAddress = Reflect.get(request, clientAddressSymbol), locals, prerenderedErrorPageFetch = fetch, routeData, waitUntil } = {}) {
            await this.pipeline.getLogger();
            if (routeData) {
                this.logger.debug("router", "The adapter " + this.manifest.adapterName + " provided a custom RouteData for ", request.url);
                this.logger.debug("router", "RouteData");
                this.logger.debug("router", routeData);
            }
            if (locals) {
                if (typeof locals !== "object") {
                    const error = new AstroError(LocalsNotAnObject);
                    this.logger.error(null, error.stack);
                    return this.renderError(request, {
                        addCookieHeader,
                        clientAddress,
                        prerenderedErrorPageFetch,
                        locals: void 0,
                        routeData,
                        waitUntil,
                        status: 500,
                        error
                    });
                }
            }
            if (!routeData) {
                const domainPathname = this.computePathnameFromDomain(request);
                if (domainPathname) {
                    routeData = this.pipeline.matchRoute(this.safeDecodeURI(domainPathname));
                }
            }
            const resolvedOptions = {
                addCookieHeader,
                clientAddress,
                prerenderedErrorPageFetch,
                locals,
                routeData,
                waitUntil
            };
            let response;
            try {
                if (this.#fetchHandler instanceof DefaultFetchHandler) {
                    Reflect.set(request, appSymbol, this);
                    response = await this.#fetchHandler.renderWithOptions(request, resolvedOptions);
                } else {
                    setRenderOptions(request, resolvedOptions);
                    Reflect.set(request, appSymbol, this);
                    response = await this.#fetchHandler.fetch(request);
                }
            } catch (err) {
                if (err instanceof MultiLevelEncodingError) {
                    return new Response("Bad Request", {
                        status: 400
                    });
                }
                throw err;
            }
            this.#warnMissingFeatures();
            if (response.headers.get(ASTRO_ERROR_HEADER)) {
                response.headers.delete(ASTRO_ERROR_HEADER);
                return this.renderError(request, {
                    addCookieHeader,
                    clientAddress,
                    prerenderedErrorPageFetch,
                    locals,
                    routeData,
                    waitUntil,
                    response,
                    status: response.status,
                    error: response.status === 500 ? null : void 0
                });
            }
            return response;
        }
        setCookieHeaders(response) {
            return getSetCookiesFromResponse(response);
        }
        static getSetCookieFromResponse = getSetCookiesFromResponse;
        async renderError(request, options) {
            return this.#errorHandler.renderError(request, options);
        }
        #warnMissingFeatures() {
            if (this.#featureCheckDone || !this.#hasCustomFetchHandler) return;
            this.#featureCheckDone = true;
            const manifest = this.manifest;
            const missing = [];
            const used = this.pipeline.usedFeatures;
            if (manifest.routes.some((r)=>r.routeData.type === "redirect") && !(used & PipelineFeatures.redirects)) {
                missing.push("redirects");
            }
            if (manifest.sessionConfig && !(used & PipelineFeatures.sessions)) {
                missing.push("sessions");
            }
            if (manifest.actions && !(used & PipelineFeatures.actions)) {
                missing.push("actions");
            }
            if (manifest.middleware && !(used & PipelineFeatures.middleware)) {
                missing.push("middleware");
            }
            if (manifest.i18n && manifest.i18n.strategy !== "manual" && !(used & PipelineFeatures.i18n)) {
                missing.push("i18n");
            }
            if (manifest.cacheConfig && !(used & PipelineFeatures.cache)) {
                missing.push("cache");
            }
            for (const feature of missing){
                this.logger.warn("router", `Your project uses ${feature}, but your custom src/app.ts does not call the ${feature}() handler. This feature will not work unless you add it to your app.ts pipeline.`);
            }
        }
        getDefaultStatusCode(routeData, pathname) {
            if (!routeData.pattern.test(pathname)) {
                for (const fallbackRoute of routeData.fallbackRoutes){
                    if (fallbackRoute.pattern.test(pathname)) {
                        return 302;
                    }
                }
            }
            const route = removeTrailingForwardSlash(routeData.route);
            if (route.endsWith("/404")) return 404;
            if (route.endsWith("/500")) return 500;
            return 200;
        }
        getManifest() {
            return this.pipeline.manifest;
        }
        logThisRequest({ pathname, method, statusCode, isRewrite, timeStart }) {
            const timeEnd = performance.now();
            this.logRequest({
                pathname,
                method,
                statusCode,
                isRewrite,
                reqTime: timeEnd - timeStart
            });
        }
    }
    function getAssetsPrefix(fileExtension, assetsPrefix) {
        let prefix = "";
        if (!assetsPrefix) {
            prefix = "";
        } else if (typeof assetsPrefix === "string") {
            prefix = assetsPrefix;
        } else {
            const dotLessFileExtension = fileExtension.slice(1);
            prefix = assetsPrefix[dotLessFileExtension] || assetsPrefix.fallback;
        }
        return prefix;
    }
    const URL_PARSE_BASE = "https://astro.build";
    function splitAssetPath(path) {
        const parsed = new URL(path, URL_PARSE_BASE);
        const isAbsolute = URL.canParse(path);
        const pathname = !isAbsolute && !path.startsWith("/") ? parsed.pathname.slice(1) : parsed.pathname;
        return {
            pathname,
            suffix: `${parsed.search}${parsed.hash}`
        };
    }
    function createAssetLink(href, base, assetsPrefix, queryParams) {
        const { pathname, suffix } = splitAssetPath(href);
        let url = "";
        if (assetsPrefix) {
            const pf = getAssetsPrefix(fileExtension(pathname), assetsPrefix);
            url = joinPaths(pf, slash(pathname)) + suffix;
        } else if (base) {
            url = prependForwardSlash$1(joinPaths(base, slash(pathname))) + suffix;
        } else {
            url = href;
        }
        return url;
    }
    function createStylesheetElement(stylesheet, base, assetsPrefix, queryParams) {
        if (stylesheet.type === "inline") {
            return {
                props: {},
                children: stylesheet.content
            };
        } else {
            return {
                props: {
                    rel: "stylesheet",
                    href: createAssetLink(stylesheet.src, base, assetsPrefix)
                },
                children: ""
            };
        }
    }
    function createStylesheetElementSet(stylesheets, base, assetsPrefix, queryParams) {
        return new Set(stylesheets.map((s)=>createStylesheetElement(s, base, assetsPrefix)));
    }
    function createModuleScriptElement(script, base, assetsPrefix, queryParams) {
        if (script.type === "external") {
            return createModuleScriptElementWithSrc(script.value, base, assetsPrefix);
        } else {
            return {
                props: {
                    type: "module"
                },
                children: script.value
            };
        }
    }
    function createModuleScriptElementWithSrc(src, base, assetsPrefix, queryParams) {
        return {
            props: {
                type: "module",
                src: createAssetLink(src, base, assetsPrefix)
            },
            children: ""
        };
    }
    class AppPipeline extends Pipeline {
        getName() {
            return "AppPipeline";
        }
        static create({ manifest, streaming }) {
            const resolve = async function resolve2(specifier) {
                if (!(specifier in manifest.entryModules)) {
                    throw new Error(`Unable to resolve [${specifier}]`);
                }
                const bundlePath = manifest.entryModules[specifier];
                if (bundlePath.startsWith("data:") || bundlePath.length === 0) {
                    return bundlePath;
                } else {
                    return createAssetLink(bundlePath, manifest.base, manifest.assetsPrefix);
                }
            };
            const logger = createConsoleLogger({
                level: manifest.logLevel
            });
            const pipeline = new AppPipeline(logger, manifest, "production", manifest.renderers, resolve, streaming, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0);
            return pipeline;
        }
        async headElements(routeData) {
            const { assetsPrefix, base } = this.manifest;
            const routeInfo = this.manifest.routes.find((route)=>route.routeData.route === routeData.route);
            const links = new Set();
            const scripts = new Set();
            const styles = createStylesheetElementSet(routeInfo?.styles ?? [], base, assetsPrefix);
            for (const script of routeInfo?.scripts ?? []){
                if ("stage" in script) {
                    if (script.stage === "head-inline") {
                        scripts.add({
                            props: {},
                            children: script.children
                        });
                    }
                } else {
                    scripts.add(createModuleScriptElement(script, base, assetsPrefix));
                }
            }
            return {
                links,
                styles,
                scripts
            };
        }
        componentMetadata() {}
        async getComponentByRoute(routeData) {
            const module = await this.getModuleForRoute(routeData);
            return module.page();
        }
        async getModuleForRoute(route) {
            for (const defaultRoute of this.defaultRoutes){
                if (route.component === defaultRoute.component) {
                    return {
                        page: ()=>Promise.resolve(defaultRoute.instance)
                    };
                }
            }
            let routeToProcess = route;
            if (routeIsRedirect(route)) {
                if (route.redirectRoute) {
                    routeToProcess = route.redirectRoute;
                } else {
                    return RedirectSinglePageBuiltModule;
                }
            } else if (routeIsFallback(route)) {
                routeToProcess = getFallbackRoute(route, this.manifest.routes);
            }
            if (this.manifest.pageMap) {
                const importComponentInstance = this.manifest.pageMap.get(routeToProcess.component);
                if (!importComponentInstance) {
                    throw new Error(`Unexpectedly unable to find a component instance for route ${route.route}`);
                }
                return await importComponentInstance();
            } else if (this.manifest.pageModule) {
                return this.manifest.pageModule;
            }
            throw new Error("Astro couldn't find the correct page to render, probably because it wasn't correctly mapped for SSR usage. This is an internal error, please file an issue.");
        }
        async tryRewrite(payload, request) {
            const { newUrl, pathname, routeData } = findRouteToRewrite({
                payload,
                request,
                routes: this.manifest?.routes.map((r)=>r.routeData),
                trailingSlash: this.manifest.trailingSlash,
                buildFormat: this.manifest.buildFormat,
                base: this.manifest.base,
                outDir: this.manifest?.serverLike ? this.manifest.buildClientDir : this.manifest.outDir
            });
            const componentInstance = await this.getComponentByRoute(routeData);
            return {
                newUrl,
                pathname,
                componentInstance,
                routeData
            };
        }
    }
    class App extends BaseApp {
        createPipeline(streaming) {
            return AppPipeline.create({
                manifest: this.manifest,
                streaming
            });
        }
        isDev() {
            return false;
        }
        logRequest(_options) {}
    }
    const contexts = new WeakMap();
    const ID_PREFIX = "r";
    function getContext(rendererContextResult) {
        if (contexts.has(rendererContextResult)) {
            return contexts.get(rendererContextResult);
        }
        const ctx = {
            currentIndex: 0,
            get id () {
                return ID_PREFIX + this.currentIndex.toString();
            }
        };
        contexts.set(rendererContextResult, ctx);
        return ctx;
    }
    function incrementId(rendererContextResult) {
        const ctx = getContext(rendererContextResult);
        const id = ctx.id;
        ctx.currentIndex++;
        return id;
    }
    const StaticHtml = ({ value, name, hydrate = true })=>{
        if (value == null || value.trim() === "") return null;
        const tagName = hydrate ? "astro-slot" : "astro-static-slot";
        return createElement(tagName, {
            name,
            suppressHydrationWarning: true,
            dangerouslySetInnerHTML: {
                __html: value
            }
        });
    };
    var static_html_default = memo(StaticHtml, ()=>true);
    const slotName = (str)=>str.trim().replace(/[-_]([a-z])/g, (_, w)=>w.toUpperCase());
    const reactTypeof = Symbol.for("react.element");
    const reactTransitionalTypeof = Symbol.for("react.transitional.element");
    async function check(Component, props, children, metadata) {
        if (typeof Component === "object") {
            return Component["$$typeof"].toString().slice("Symbol(".length).startsWith("react");
        }
        if (typeof Component !== "function") return false;
        if (Component.name === "QwikComponent") return false;
        if (typeof Component === "function" && Component["$$typeof"] === Symbol.for("react.forward_ref")) return false;
        if (Component.prototype != null && typeof Component.prototype.render === "function") {
            return React__default.Component.isPrototypeOf(Component) || React__default.PureComponent.isPrototypeOf(Component);
        }
        let isReactComponent = false;
        function Tester(...args) {
            try {
                const vnode = Component(...args);
                if (vnode && (vnode["$$typeof"] === reactTypeof || vnode["$$typeof"] === reactTransitionalTypeof)) {
                    isReactComponent = true;
                }
            } catch  {}
            return React__default.createElement("div");
        }
        await renderToStaticMarkup.call(this, Tester, props, children);
        return isReactComponent;
    }
    async function getNodeWritable() {
        let nodeStreamBuiltinModuleName = "node:stream";
        let { Writable } = await import(nodeStreamBuiltinModuleName).then(async (m)=>{
            await m.__tla;
            return m;
        });
        return Writable;
    }
    function needsHydration(metadata) {
        return metadata?.astroStaticSlot ? !!metadata.hydrate : true;
    }
    async function renderToStaticMarkup(Component, props, { default: children, ...slotted }, metadata) {
        let prefix;
        if (this && this.result) {
            prefix = incrementId(this.result);
        }
        const attrs = {
            prefix
        };
        delete props["class"];
        const slots = {};
        for (const [key, value] of Object.entries(slotted)){
            const name = slotName(key);
            slots[name] = React__default.createElement(static_html_default, {
                hydrate: needsHydration(metadata),
                value,
                name
            });
        }
        const newProps = {
            ...props,
            ...slots
        };
        const newChildren = children ?? props.children;
        if (newChildren != null) {
            newProps.children = React__default.createElement(static_html_default, {
                hydrate: needsHydration(metadata),
                value: newChildren
            });
        }
        const formState = this ? await getFormState(this) : void 0;
        if (formState) {
            attrs["data-action-result"] = JSON.stringify(formState[0]);
            attrs["data-action-key"] = formState[1];
            attrs["data-action-name"] = formState[2];
        }
        const vnode = React__default.createElement(Component, newProps);
        const renderOptions = {
            identifierPrefix: prefix,
            formState
        };
        let html;
        if ("renderToReadableStream" in ReactDOM) {
            html = await renderToReadableStreamAsync(vnode, renderOptions);
        } else {
            html = await renderToPipeableStreamAsync(vnode, renderOptions);
        }
        html = html.replace(/<link\s[^>]*rel="(?:preload|modulepreload|stylesheet|preconnect|dns-prefetch)"[^>]*>/g, "");
        return {
            html,
            attrs
        };
    }
    async function getFormState({ result }) {
        const { request, actionResult } = result;
        if (!actionResult) return void 0;
        if (!isFormRequest(request.headers.get("content-type"))) return void 0;
        const { searchParams } = new URL(request.url);
        const formData = await request.clone().formData();
        const actionKey = formData.get("$ACTION_KEY")?.toString();
        const actionName = searchParams.get("_action");
        if (!actionKey || !actionName) return void 0;
        return [
            actionResult,
            actionKey,
            actionName
        ];
    }
    async function renderToPipeableStreamAsync(vnode, options) {
        const Writable = await getNodeWritable();
        let html = "";
        return new Promise((resolve, reject)=>{
            let error = void 0;
            let stream = ReactDOM.renderToPipeableStream(vnode, {
                ...options,
                onError (err) {
                    error = err;
                    reject(error);
                },
                onAllReady () {
                    stream.pipe(new Writable({
                        write (chunk, _encoding, callback) {
                            html += chunk.toString("utf-8");
                            callback();
                        },
                        destroy () {
                            resolve(html);
                        }
                    }));
                }
            });
        });
    }
    async function readResult(stream) {
        const reader = stream.getReader();
        let result = "";
        const decoder = new TextDecoder("utf-8");
        while(true){
            const { done, value } = await reader.read();
            if (done) {
                if (value) {
                    result += decoder.decode(value);
                } else {
                    decoder.decode(new Uint8Array());
                }
                return result;
            }
            result += decoder.decode(value, {
                stream: true
            });
        }
    }
    async function renderToReadableStreamAsync(vnode, options) {
        return await readResult(await ReactDOM.renderToReadableStream(vnode, options));
    }
    const formContentTypes = [
        "application/x-www-form-urlencoded",
        "multipart/form-data"
    ];
    function isFormRequest(contentType) {
        const type = contentType?.split(";")[0].toLowerCase();
        return formContentTypes.some((t)=>type === t);
    }
    const renderer = {
        name: "@astrojs/react",
        check,
        renderToStaticMarkup,
        supportsAstroStaticSlot: true
    };
    var server_default = renderer;
    const renderers = [
        Object.assign({
            "name": "@astrojs/react",
            "clientEntrypoint": "@astrojs/react/client.js",
            "serverEntrypoint": "@astrojs/react/server.js"
        }, {
            ssr: server_default
        })
    ];
    const serializedData = [
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "type": "page",
                "component": "_server-islands.astro",
                "params": [
                    "name"
                ],
                "segments": [
                    [
                        {
                            "content": "_server-islands",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "name",
                            "dynamic": true,
                            "spread": false
                        }
                    ]
                ],
                "pattern": "^\\/_server-islands\\/([^/]+?)\\/?$",
                "prerender": false,
                "isIndex": false,
                "fallbackRoutes": [],
                "route": "/_server-islands/[name]",
                "origin": "internal",
                "distURL": [],
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/_image",
                "component": "node_modules/astro/dist/assets/endpoint/node.js",
                "params": [],
                "pathname": "/_image",
                "pattern": "^\\/_image\\/?$",
                "segments": [
                    [
                        {
                            "content": "_image",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "type": "endpoint",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "isIndex": false,
                "origin": "internal",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/artifacts/[id]",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/artifacts\\/([^/]+?)\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "artifacts",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "id",
                            "dynamic": true,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "id"
                ],
                "component": "src/pages/api/artifacts/[id].ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/artifacts",
                "isIndex": true,
                "type": "endpoint",
                "pattern": "^\\/api\\/artifacts\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "artifacts",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/artifacts/index.ts",
                "pathname": "/api/artifacts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/chat",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/chat\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "chat",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/chat.ts",
                "pathname": "/api/chat",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/context/widgets",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/context\\/widgets\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "context",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "widgets",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/context/widgets.ts",
                "pathname": "/api/context/widgets",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/conversations/[id]",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/conversations\\/([^/]+?)\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "conversations",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "id",
                            "dynamic": true,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "id"
                ],
                "component": "src/pages/api/conversations/[id].ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/conversations",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/conversations\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "conversations",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/conversations.ts",
                "pathname": "/api/conversations",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/credentials/manifest",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/credentials\\/manifest\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "credentials",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "manifest",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/credentials/manifest.ts",
                "pathname": "/api/credentials/manifest",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/design/health",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/design\\/health\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "design",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "health",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/design/health.ts",
                "pathname": "/api/design/health",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/design/[...path]",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/design(?:\\/(.*?))?\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "design",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "...path",
                            "dynamic": true,
                            "spread": true
                        }
                    ]
                ],
                "params": [
                    "...path"
                ],
                "component": "src/pages/api/design/[...path].ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/executions/[id]/events",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/executions\\/([^/]+?)\\/events\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "executions",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "id",
                            "dynamic": true,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "events",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "id"
                ],
                "component": "src/pages/api/executions/[id]/events.ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/executions/[id]",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/executions\\/([^/]+?)\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "executions",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "id",
                            "dynamic": true,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "id"
                ],
                "component": "src/pages/api/executions/[id].ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/executions",
                "isIndex": true,
                "type": "endpoint",
                "pattern": "^\\/api\\/executions\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "executions",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/executions/index.ts",
                "pathname": "/api/executions",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/integrations/composio/callback",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/integrations\\/composio\\/callback\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "integrations",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "composio",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "callback",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/integrations/composio/callback.ts",
                "pathname": "/api/integrations/composio/callback",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/integrations/[slotId]/connect",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/integrations\\/([^/]+?)\\/connect\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "integrations",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "slotId",
                            "dynamic": true,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "connect",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "slotId"
                ],
                "component": "src/pages/api/integrations/[slotId]/connect.ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/integrations/[slotId]/credentials",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/integrations\\/([^/]+?)\\/credentials\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "integrations",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "slotId",
                            "dynamic": true,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "credentials",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "slotId"
                ],
                "component": "src/pages/api/integrations/[slotId]/credentials.ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/integrations/[slotId]/disconnect",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/integrations\\/([^/]+?)\\/disconnect\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "integrations",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "slotId",
                            "dynamic": true,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "disconnect",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "slotId"
                ],
                "component": "src/pages/api/integrations/[slotId]/disconnect.ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/library",
                "isIndex": true,
                "type": "endpoint",
                "pattern": "^\\/api\\/library\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "library",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/library/index.ts",
                "pathname": "/api/library",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/observability/metrics",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/observability\\/metrics\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "observability",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "metrics",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/observability/metrics.ts",
                "pathname": "/api/observability/metrics",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/projects/[id]",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/projects\\/([^/]+?)\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "projects",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "id",
                            "dynamic": true,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "id"
                ],
                "component": "src/pages/api/projects/[id].ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/projects",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/projects\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "projects",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/projects.ts",
                "pathname": "/api/projects",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/active-runs",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/active-runs\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "active-runs",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/active-runs.ts",
                "pathname": "/api/runtime/active-runs",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/browser/action",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/browser\\/action\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "browser",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "action",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/browser/action.ts",
                "pathname": "/api/runtime/browser/action",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/browser/cdp",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/browser\\/cdp\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "browser",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "cdp",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/browser/cdp.ts",
                "pathname": "/api/runtime/browser/cdp",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/browser/session",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/browser\\/session\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "browser",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "session",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/browser/session.ts",
                "pathname": "/api/runtime/browser/session",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/browser/stream",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/browser\\/stream\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "browser",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "stream",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/browser/stream.ts",
                "pathname": "/api/runtime/browser/stream",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/commands",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/commands\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "commands",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/commands.ts",
                "pathname": "/api/runtime/commands",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/computer-use/preview/action",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/computer-use\\/preview\\/action\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "computer-use",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "preview",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "action",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/computer-use/preview/action.ts",
                "pathname": "/api/runtime/computer-use/preview/action",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/computer-use/preview/session",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/computer-use\\/preview\\/session\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "computer-use",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "preview",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "session",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/computer-use/preview/session.ts",
                "pathname": "/api/runtime/computer-use/preview/session",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/computer-use/preview/stream",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/computer-use\\/preview\\/stream\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "computer-use",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "preview",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "stream",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/computer-use/preview/stream.ts",
                "pathname": "/api/runtime/computer-use/preview/stream",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/computer-use/sandbox/action",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/computer-use\\/sandbox\\/action\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "computer-use",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "sandbox",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "action",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/computer-use/sandbox/action.ts",
                "pathname": "/api/runtime/computer-use/sandbox/action",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/computer-use/sandbox/preflight",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/computer-use\\/sandbox\\/preflight\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "computer-use",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "sandbox",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "preflight",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/computer-use/sandbox/preflight.ts",
                "pathname": "/api/runtime/computer-use/sandbox/preflight",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/computer-use/sandbox/status",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/computer-use\\/sandbox\\/status\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "computer-use",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "sandbox",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "status",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/computer-use/sandbox/status.ts",
                "pathname": "/api/runtime/computer-use/sandbox/status",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/computer-use/session",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/computer-use\\/session\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "computer-use",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "session",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/computer-use/session.ts",
                "pathname": "/api/runtime/computer-use/session",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/context-usage",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/context-usage\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "context-usage",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/context-usage.ts",
                "pathname": "/api/runtime/context-usage",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/dispatch-health",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/dispatch-health\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "dispatch-health",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/dispatch-health.ts",
                "pathname": "/api/runtime/dispatch-health",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/harness-spec",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/harness-spec\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "harness-spec",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/harness-spec.ts",
                "pathname": "/api/runtime/harness-spec",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/hub/events",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/hub\\/events\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "hub",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "events",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/hub/events.ts",
                "pathname": "/api/runtime/hub/events",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/observability",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/observability\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "observability",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/observability.ts",
                "pathname": "/api/runtime/observability",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/readiness",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/readiness\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "readiness",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/readiness.ts",
                "pathname": "/api/runtime/readiness",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/reconcile-auth",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/reconcile-auth\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "reconcile-auth",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/reconcile-auth.ts",
                "pathname": "/api/runtime/reconcile-auth",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/runs/[runId]/attach",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/runs\\/([^/]+?)\\/attach\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runs",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runId",
                            "dynamic": true,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "attach",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "runId"
                ],
                "component": "src/pages/api/runtime/runs/[runId]/attach.ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/runs/[runId]/cancel",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/runs\\/([^/]+?)\\/cancel\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runs",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runId",
                            "dynamic": true,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "cancel",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "runId"
                ],
                "component": "src/pages/api/runtime/runs/[runId]/cancel.ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/runs/[runId]/diagnostics",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/runs\\/([^/]+?)\\/diagnostics\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runs",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runId",
                            "dynamic": true,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "diagnostics",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "runId"
                ],
                "component": "src/pages/api/runtime/runs/[runId]/diagnostics.ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/runs/[runId]/reconcile",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/runs\\/([^/]+?)\\/reconcile\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runs",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runId",
                            "dynamic": true,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "reconcile",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "runId"
                ],
                "component": "src/pages/api/runtime/runs/[runId]/reconcile.ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/shutdown",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/shutdown\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "shutdown",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/shutdown.ts",
                "pathname": "/api/runtime/shutdown",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/stream",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/stream\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "stream",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/stream.ts",
                "pathname": "/api/runtime/stream",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/transcribe",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/transcribe\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "transcribe",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/transcribe.ts",
                "pathname": "/api/runtime/transcribe",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/ui/manifest",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/ui\\/manifest\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "ui",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "manifest",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/ui/manifest.ts",
                "pathname": "/api/runtime/ui/manifest",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/upload",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/upload\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "upload",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/upload.ts",
                "pathname": "/api/runtime/upload",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/runtime/voice/status",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/runtime\\/voice\\/status\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "runtime",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "voice",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "status",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/runtime/voice/status.ts",
                "pathname": "/api/runtime/voice/status",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/schedules/[entryId]/run-now",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/schedules\\/([^/]+?)\\/run-now\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "schedules",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "entryId",
                            "dynamic": true,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "run-now",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "entryId"
                ],
                "component": "src/pages/api/schedules/[entryId]/run-now.ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/schedules/[entryId]",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/schedules\\/([^/]+?)\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "schedules",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "entryId",
                            "dynamic": true,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "entryId"
                ],
                "component": "src/pages/api/schedules/[entryId].ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/schedules",
                "isIndex": true,
                "type": "endpoint",
                "pattern": "^\\/api\\/schedules\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "schedules",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/schedules/index.ts",
                "pathname": "/api/schedules",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/settings/computer-use/activate",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/settings\\/computer-use\\/activate\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "settings",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "computer-use",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "activate",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/settings/computer-use/activate.ts",
                "pathname": "/api/settings/computer-use/activate",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/settings/computer-use/grant-permissions",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/settings\\/computer-use\\/grant-permissions\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "settings",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "computer-use",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "grant-permissions",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/settings/computer-use/grant-permissions.ts",
                "pathname": "/api/settings/computer-use/grant-permissions",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/settings/computer-use",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/settings\\/computer-use\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "settings",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "computer-use",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/settings/computer-use.ts",
                "pathname": "/api/settings/computer-use",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/settings/presentation",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/settings\\/presentation\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "settings",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "presentation",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/settings/presentation.ts",
                "pathname": "/api/settings/presentation",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/settings",
                "isIndex": true,
                "type": "endpoint",
                "pattern": "^\\/api\\/settings\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "settings",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/settings/index.ts",
                "pathname": "/api/settings",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/shell/bootstrap",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/shell\\/bootstrap\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "shell",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "bootstrap",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/shell/bootstrap.ts",
                "pathname": "/api/shell/bootstrap",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/ui/brand-asset",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/ui\\/brand-asset\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "ui",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "brand-asset",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/ui/brand-asset.ts",
                "pathname": "/api/ui/brand-asset",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/ui/composer-config",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/ui\\/composer-config\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "ui",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "composer-config",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/ui/composer-config.ts",
                "pathname": "/api/ui/composer-config",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/ui/reader-preferences",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/ui\\/reader-preferences\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "ui",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "reader-preferences",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/ui/reader-preferences.ts",
                "pathname": "/api/ui/reader-preferences",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/ui/right-panel",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/ui\\/right-panel\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "ui",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "right-panel",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/ui/right-panel.ts",
                "pathname": "/api/ui/right-panel",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/ui/shell-layout",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/ui\\/shell-layout\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "ui",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "shell-layout",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/ui/shell-layout.ts",
                "pathname": "/api/ui/shell-layout",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/workflows/[id]",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/workflows\\/([^/]+?)\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "workflows",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "id",
                            "dynamic": true,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "id"
                ],
                "component": "src/pages/api/workflows/[id].ts",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/workflows",
                "isIndex": true,
                "type": "endpoint",
                "pattern": "^\\/api\\/workflows\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "workflows",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/workflows/index.ts",
                "pathname": "/api/workflows",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/workspace/ensure-scratch",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/workspace\\/ensure-scratch\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "workspace",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "ensure-scratch",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/workspace/ensure-scratch.ts",
                "pathname": "/api/workspace/ensure-scratch",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/workspace/file",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/workspace\\/file\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "workspace",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "file",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/workspace/file.ts",
                "pathname": "/api/workspace/file",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/api/workspace/files",
                "isIndex": false,
                "type": "endpoint",
                "pattern": "^\\/api\\/workspace\\/files\\/?$",
                "segments": [
                    [
                        {
                            "content": "api",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "workspace",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "files",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/api/workspace/files.ts",
                "pathname": "/api/workspace/files",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/artifact/[id]",
                "isIndex": false,
                "type": "page",
                "pattern": "^\\/artifact\\/([^/]+?)\\/?$",
                "segments": [
                    [
                        {
                            "content": "artifact",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "id",
                            "dynamic": true,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "id"
                ],
                "component": "src/pages/artifact/[id].astro",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/conversation/[id]",
                "isIndex": false,
                "type": "page",
                "pattern": "^\\/conversation\\/([^/]+?)\\/?$",
                "segments": [
                    [
                        {
                            "content": "conversation",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "id",
                            "dynamic": true,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "id"
                ],
                "component": "src/pages/conversation/[id].astro",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/dashboard",
                "isIndex": false,
                "type": "page",
                "pattern": "^\\/dashboard\\/?$",
                "segments": [
                    [
                        {
                            "content": "dashboard",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/dashboard.astro",
                "pathname": "/dashboard",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/design",
                "isIndex": true,
                "type": "page",
                "pattern": "^\\/design\\/?$",
                "segments": [
                    [
                        {
                            "content": "design",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/design/index.astro",
                "pathname": "/design",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/design/[...slug]",
                "isIndex": false,
                "type": "page",
                "pattern": "^\\/design(?:\\/(.*?))?\\/?$",
                "segments": [
                    [
                        {
                            "content": "design",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "...slug",
                            "dynamic": true,
                            "spread": true
                        }
                    ]
                ],
                "params": [
                    "...slug"
                ],
                "component": "src/pages/design/[...slug].astro",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/execution/[id]",
                "isIndex": false,
                "type": "page",
                "pattern": "^\\/execution\\/([^/]+?)\\/?$",
                "segments": [
                    [
                        {
                            "content": "execution",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "id",
                            "dynamic": true,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "id"
                ],
                "component": "src/pages/execution/[id].astro",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/executions",
                "isIndex": false,
                "type": "page",
                "pattern": "^\\/executions\\/?$",
                "segments": [
                    [
                        {
                            "content": "executions",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/executions.astro",
                "pathname": "/executions",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/integrations/composio/callback",
                "isIndex": false,
                "type": "page",
                "pattern": "^\\/integrations\\/composio\\/callback\\/?$",
                "segments": [
                    [
                        {
                            "content": "integrations",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "composio",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "callback",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/integrations/composio/callback.astro",
                "pathname": "/integrations/composio/callback",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/library",
                "isIndex": false,
                "type": "page",
                "pattern": "^\\/library\\/?$",
                "segments": [
                    [
                        {
                            "content": "library",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/library.astro",
                "pathname": "/library",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/project/[id]",
                "isIndex": false,
                "type": "page",
                "pattern": "^\\/project\\/([^/]+?)\\/?$",
                "segments": [
                    [
                        {
                            "content": "project",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "id",
                            "dynamic": true,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "id"
                ],
                "component": "src/pages/project/[id].astro",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/projects",
                "isIndex": false,
                "type": "page",
                "pattern": "^\\/projects\\/?$",
                "segments": [
                    [
                        {
                            "content": "projects",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/projects.astro",
                "pathname": "/projects",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/scheduled",
                "isIndex": false,
                "type": "page",
                "pattern": "^\\/scheduled\\/?$",
                "segments": [
                    [
                        {
                            "content": "scheduled",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/scheduled.astro",
                "pathname": "/scheduled",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/settings",
                "isIndex": false,
                "type": "page",
                "pattern": "^\\/settings\\/?$",
                "segments": [
                    [
                        {
                            "content": "settings",
                            "dynamic": false,
                            "spread": false
                        }
                    ]
                ],
                "params": [],
                "component": "src/pages/settings.astro",
                "pathname": "/settings",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/workflow/[id]",
                "isIndex": false,
                "type": "page",
                "pattern": "^\\/workflow\\/([^/]+?)\\/?$",
                "segments": [
                    [
                        {
                            "content": "workflow",
                            "dynamic": false,
                            "spread": false
                        }
                    ],
                    [
                        {
                            "content": "id",
                            "dynamic": true,
                            "spread": false
                        }
                    ]
                ],
                "params": [
                    "id"
                ],
                "component": "src/pages/workflow/[id].astro",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        },
        {
            "file": "",
            "links": [],
            "scripts": [],
            "styles": [],
            "routeData": {
                "route": "/",
                "isIndex": true,
                "type": "page",
                "pattern": "^\\/$",
                "segments": [],
                "params": [],
                "component": "src/pages/index.astro",
                "pathname": "/",
                "prerender": false,
                "fallbackRoutes": [],
                "distURL": [],
                "origin": "project",
                "_meta": {
                    "trailingSlash": "ignore"
                }
            }
        }
    ];
    serializedData.map(deserializeRouteInfo);
    const _page0 = ()=>import('./node_Pc9DL4s5.mjs').then(async (m)=>{
            await m.__tla;
            return m;
        }).then((n)=>n.n);
    const _page1 = ()=>import('./_id__7zg0NQN-.mjs');
    const _page2 = ()=>import('./index_CYIHywiI.mjs');
    const _page3 = ()=>import('./chat_CoK7NTMo.mjs');
    const _page4 = ()=>import('./widgets_DHyDwB5X.mjs');
    const _page5 = ()=>import('./_id__CFYH6urZ.mjs');
    const _page6 = ()=>import('./conversations_D99bh3wE.mjs');
    const _page7 = ()=>import('./manifest_DHARiQ_j.mjs');
    const _page8 = ()=>import('./health_Mvvy7p-W.mjs');
    const _page9 = ()=>import('./_.._CniBtTRb.mjs');
    const _page10 = ()=>import('./events_C_kPjtSt.mjs');
    const _page11 = ()=>import('./_id__1HKEhDfc.mjs');
    const _page12 = ()=>import('./index_Dj1fyow1.mjs');
    const _page13 = ()=>import('./callback_BqvsG2vO.mjs');
    const _page14 = ()=>import('./connect_DbZuoVMV.mjs');
    const _page15 = ()=>import('./credentials_DqnGhq7W.mjs');
    const _page16 = ()=>import('./disconnect_CJ4C_NCi.mjs');
    const _page17 = ()=>import('./index_okPz9JUO.mjs');
    const _page18 = ()=>import('./metrics_Ci8iWeXt.mjs');
    const _page19 = ()=>import('./_id__DOzFjm9x.mjs');
    const _page20 = ()=>import('./projects_D1VkK5sz.mjs');
    const _page21 = ()=>import('./active-runs_CgDxXIi8.mjs');
    const _page22 = ()=>import('./action_DhIIl-RB.mjs');
    const _page23 = ()=>import('./cdp_2heYrAAY.mjs');
    const _page24 = ()=>import('./session_ZKXxpoLB.mjs');
    const _page25 = ()=>import('./stream_DP_2ylcD.mjs');
    const _page26 = ()=>import('./commands_s5-Y_fIk.mjs');
    const _page27 = ()=>import('./action_Dvb0x1jm.mjs');
    const _page28 = ()=>import('./session_y7SFsaAZ.mjs');
    const _page29 = ()=>import('./stream_BBwu8FzY.mjs');
    const _page30 = ()=>import('./action_BOxCXoIP.mjs');
    const _page31 = ()=>import('./preflight_CHnLpXVg.mjs');
    const _page32 = ()=>import('./status_KJ_eZD7m.mjs');
    const _page33 = ()=>import('./session_BBT8KhhD.mjs');
    const _page34 = ()=>import('./context-usage_2g0-pNJt.mjs');
    const _page35 = ()=>import('./dispatch-health_D8EKBM1u.mjs');
    const _page36 = ()=>import('./harness-spec_C3pyoUBs.mjs');
    const _page37 = ()=>import('./events_CQEKeCDd.mjs');
    const _page38 = ()=>import('./observability_AnQlJLWD.mjs');
    const _page39 = ()=>import('./readiness_mO_WXNul.mjs');
    const _page40 = ()=>import('./reconcile-auth_CzRHFNUX.mjs');
    const _page41 = ()=>import('./attach_DvImd1Sr.mjs');
    const _page42 = ()=>import('./cancel_CiDhfgh1.mjs');
    const _page43 = ()=>import('./diagnostics_r9HJKePM.mjs');
    const _page44 = ()=>import('./reconcile_DhLAi8B4.mjs');
    const _page45 = ()=>import('./shutdown_CBP_-PiK.mjs');
    const _page46 = ()=>import('./stream_DWf2qN6c.mjs').then(async (m)=>{
            await m.__tla;
            return m;
        });
    const _page47 = ()=>import('./transcribe_BoD77Keq.mjs');
    const _page48 = ()=>import('./manifest_BXczaknd.mjs');
    const _page49 = ()=>import('./upload_BVLtvHHx.mjs');
    const _page50 = ()=>import('./status_CeUk5OTt.mjs');
    const _page51 = ()=>import('./run-now_BPzfyXOp.mjs');
    const _page52 = ()=>import('./_entryId__81wk16PN.mjs');
    const _page53 = ()=>import('./index_BJCclhco.mjs');
    const _page54 = ()=>import('./activate_MxRRK9SF.mjs');
    const _page55 = ()=>import('./grant-permissions_5GTKVC8Q.mjs');
    const _page56 = ()=>import('./computer-use_BPiPpZRq.mjs');
    const _page57 = ()=>import('./presentation_DiBHiNfe.mjs');
    const _page58 = ()=>import('./index_BRezsJEq.mjs');
    const _page59 = ()=>import('./bootstrap_C4JKMd9m.mjs');
    const _page60 = ()=>import('./brand-asset_D5sf0kiQ.mjs');
    const _page61 = ()=>import('./composer-config_BI2WK837.mjs');
    const _page62 = ()=>import('./reader-preferences_BK37sD5d.mjs');
    const _page63 = ()=>import('./right-panel_BSzBi47a.mjs');
    const _page64 = ()=>import('./shell-layout_MXzxCKcA.mjs');
    const _page65 = ()=>import('./_id__DqYItgNl.mjs');
    const _page66 = ()=>import('./index_BqP25PnD.mjs');
    const _page67 = ()=>import('./ensure-scratch_BpQkbqMx.mjs');
    const _page68 = ()=>import('./file_CcAYq0K4.mjs');
    const _page69 = ()=>import('./files_BllB-Ufw.mjs');
    const _page70 = ()=>import('./_id__DuwT5dkl.mjs');
    const _page71 = ()=>import('./_id__CaNApmhB.mjs');
    const _page72 = ()=>import('./dashboard_CDxbI2jZ.mjs');
    const _page73 = ()=>import('./index_DE-NqqD4.mjs');
    const _page74 = ()=>import('./_.._Bv6gomnH.mjs');
    const _page75 = ()=>import('./_id__DLjQZ0BV.mjs');
    const _page76 = ()=>import('./executions_COWaAJA6.mjs');
    const _page77 = ()=>import('./callback_EmKYBrtl.mjs');
    const _page78 = ()=>import('./library_BwRSLqYW.mjs');
    const _page79 = ()=>import('./_id__C-6yc8GT.mjs');
    const _page80 = ()=>import('./projects_q6FLkKDA.mjs');
    const _page81 = ()=>import('./scheduled_rAvTHkyv.mjs');
    const _page82 = ()=>import('./settings_CLxxXwm7.mjs');
    const _page83 = ()=>import('./_id__zY9Z3zc4.mjs');
    const _page84 = ()=>import('./index_akbJP8Zl.mjs');
    const pageMap = new Map([
        [
            "node_modules/astro/dist/assets/endpoint/node.js",
            _page0
        ],
        [
            "src/pages/api/artifacts/[id].ts",
            _page1
        ],
        [
            "src/pages/api/artifacts/index.ts",
            _page2
        ],
        [
            "src/pages/api/chat.ts",
            _page3
        ],
        [
            "src/pages/api/context/widgets.ts",
            _page4
        ],
        [
            "src/pages/api/conversations/[id].ts",
            _page5
        ],
        [
            "src/pages/api/conversations.ts",
            _page6
        ],
        [
            "src/pages/api/credentials/manifest.ts",
            _page7
        ],
        [
            "src/pages/api/design/health.ts",
            _page8
        ],
        [
            "src/pages/api/design/[...path].ts",
            _page9
        ],
        [
            "src/pages/api/executions/[id]/events.ts",
            _page10
        ],
        [
            "src/pages/api/executions/[id].ts",
            _page11
        ],
        [
            "src/pages/api/executions/index.ts",
            _page12
        ],
        [
            "src/pages/api/integrations/composio/callback.ts",
            _page13
        ],
        [
            "src/pages/api/integrations/[slotId]/connect.ts",
            _page14
        ],
        [
            "src/pages/api/integrations/[slotId]/credentials.ts",
            _page15
        ],
        [
            "src/pages/api/integrations/[slotId]/disconnect.ts",
            _page16
        ],
        [
            "src/pages/api/library/index.ts",
            _page17
        ],
        [
            "src/pages/api/observability/metrics.ts",
            _page18
        ],
        [
            "src/pages/api/projects/[id].ts",
            _page19
        ],
        [
            "src/pages/api/projects.ts",
            _page20
        ],
        [
            "src/pages/api/runtime/active-runs.ts",
            _page21
        ],
        [
            "src/pages/api/runtime/browser/action.ts",
            _page22
        ],
        [
            "src/pages/api/runtime/browser/cdp.ts",
            _page23
        ],
        [
            "src/pages/api/runtime/browser/session.ts",
            _page24
        ],
        [
            "src/pages/api/runtime/browser/stream.ts",
            _page25
        ],
        [
            "src/pages/api/runtime/commands.ts",
            _page26
        ],
        [
            "src/pages/api/runtime/computer-use/preview/action.ts",
            _page27
        ],
        [
            "src/pages/api/runtime/computer-use/preview/session.ts",
            _page28
        ],
        [
            "src/pages/api/runtime/computer-use/preview/stream.ts",
            _page29
        ],
        [
            "src/pages/api/runtime/computer-use/sandbox/action.ts",
            _page30
        ],
        [
            "src/pages/api/runtime/computer-use/sandbox/preflight.ts",
            _page31
        ],
        [
            "src/pages/api/runtime/computer-use/sandbox/status.ts",
            _page32
        ],
        [
            "src/pages/api/runtime/computer-use/session.ts",
            _page33
        ],
        [
            "src/pages/api/runtime/context-usage.ts",
            _page34
        ],
        [
            "src/pages/api/runtime/dispatch-health.ts",
            _page35
        ],
        [
            "src/pages/api/runtime/harness-spec.ts",
            _page36
        ],
        [
            "src/pages/api/runtime/hub/events.ts",
            _page37
        ],
        [
            "src/pages/api/runtime/observability.ts",
            _page38
        ],
        [
            "src/pages/api/runtime/readiness.ts",
            _page39
        ],
        [
            "src/pages/api/runtime/reconcile-auth.ts",
            _page40
        ],
        [
            "src/pages/api/runtime/runs/[runId]/attach.ts",
            _page41
        ],
        [
            "src/pages/api/runtime/runs/[runId]/cancel.ts",
            _page42
        ],
        [
            "src/pages/api/runtime/runs/[runId]/diagnostics.ts",
            _page43
        ],
        [
            "src/pages/api/runtime/runs/[runId]/reconcile.ts",
            _page44
        ],
        [
            "src/pages/api/runtime/shutdown.ts",
            _page45
        ],
        [
            "src/pages/api/runtime/stream.ts",
            _page46
        ],
        [
            "src/pages/api/runtime/transcribe.ts",
            _page47
        ],
        [
            "src/pages/api/runtime/ui/manifest.ts",
            _page48
        ],
        [
            "src/pages/api/runtime/upload.ts",
            _page49
        ],
        [
            "src/pages/api/runtime/voice/status.ts",
            _page50
        ],
        [
            "src/pages/api/schedules/[entryId]/run-now.ts",
            _page51
        ],
        [
            "src/pages/api/schedules/[entryId].ts",
            _page52
        ],
        [
            "src/pages/api/schedules/index.ts",
            _page53
        ],
        [
            "src/pages/api/settings/computer-use/activate.ts",
            _page54
        ],
        [
            "src/pages/api/settings/computer-use/grant-permissions.ts",
            _page55
        ],
        [
            "src/pages/api/settings/computer-use.ts",
            _page56
        ],
        [
            "src/pages/api/settings/presentation.ts",
            _page57
        ],
        [
            "src/pages/api/settings/index.ts",
            _page58
        ],
        [
            "src/pages/api/shell/bootstrap.ts",
            _page59
        ],
        [
            "src/pages/api/ui/brand-asset.ts",
            _page60
        ],
        [
            "src/pages/api/ui/composer-config.ts",
            _page61
        ],
        [
            "src/pages/api/ui/reader-preferences.ts",
            _page62
        ],
        [
            "src/pages/api/ui/right-panel.ts",
            _page63
        ],
        [
            "src/pages/api/ui/shell-layout.ts",
            _page64
        ],
        [
            "src/pages/api/workflows/[id].ts",
            _page65
        ],
        [
            "src/pages/api/workflows/index.ts",
            _page66
        ],
        [
            "src/pages/api/workspace/ensure-scratch.ts",
            _page67
        ],
        [
            "src/pages/api/workspace/file.ts",
            _page68
        ],
        [
            "src/pages/api/workspace/files.ts",
            _page69
        ],
        [
            "src/pages/artifact/[id].astro",
            _page70
        ],
        [
            "src/pages/conversation/[id].astro",
            _page71
        ],
        [
            "src/pages/dashboard.astro",
            _page72
        ],
        [
            "src/pages/design/index.astro",
            _page73
        ],
        [
            "src/pages/design/[...slug].astro",
            _page74
        ],
        [
            "src/pages/execution/[id].astro",
            _page75
        ],
        [
            "src/pages/executions.astro",
            _page76
        ],
        [
            "src/pages/integrations/composio/callback.astro",
            _page77
        ],
        [
            "src/pages/library.astro",
            _page78
        ],
        [
            "src/pages/project/[id].astro",
            _page79
        ],
        [
            "src/pages/projects.astro",
            _page80
        ],
        [
            "src/pages/scheduled.astro",
            _page81
        ],
        [
            "src/pages/settings.astro",
            _page82
        ],
        [
            "src/pages/workflow/[id].astro",
            _page83
        ],
        [
            "src/pages/index.astro",
            _page84
        ]
    ]);
    const _manifest = deserializeManifest(({"rootDir":"file:///Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/","cacheDir":"file:///Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/.astro/","outDir":"file:///Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/dist/","srcDir":"file:///Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/","publicDir":"file:///Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/public/","buildClientDir":"file:///Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/dist/client/","buildServerDir":"file:///Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/dist/server/","adapterName":"@astrojs/node","assetsDir":"_astro","routes":[{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"type":"page","component":"_server-islands.astro","params":["name"],"segments":[[{"content":"_server-islands","dynamic":false,"spread":false}],[{"content":"name","dynamic":true,"spread":false}]],"pattern":"^\\/_server-islands\\/([^/]+?)\\/?$","prerender":false,"isIndex":false,"fallbackRoutes":[],"route":"/_server-islands/[name]","origin":"internal","distURL":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/_image","component":"node_modules/astro/dist/assets/endpoint/node.js","params":[],"pathname":"/_image","pattern":"^\\/_image\\/?$","segments":[[{"content":"_image","dynamic":false,"spread":false}]],"type":"endpoint","prerender":false,"fallbackRoutes":[],"distURL":[],"isIndex":false,"origin":"internal","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/artifacts/[id]","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/artifacts\\/([^/]+?)\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"artifacts","dynamic":false,"spread":false}],[{"content":"id","dynamic":true,"spread":false}]],"params":["id"],"component":"src/pages/api/artifacts/[id].ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/artifacts","isIndex":true,"type":"endpoint","pattern":"^\\/api\\/artifacts\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"artifacts","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/artifacts/index.ts","pathname":"/api/artifacts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/chat","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/chat\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"chat","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/chat.ts","pathname":"/api/chat","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/context/widgets","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/context\\/widgets\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"context","dynamic":false,"spread":false}],[{"content":"widgets","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/context/widgets.ts","pathname":"/api/context/widgets","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/conversations/[id]","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/conversations\\/([^/]+?)\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"conversations","dynamic":false,"spread":false}],[{"content":"id","dynamic":true,"spread":false}]],"params":["id"],"component":"src/pages/api/conversations/[id].ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/conversations","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/conversations\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"conversations","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/conversations.ts","pathname":"/api/conversations","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/credentials/manifest","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/credentials\\/manifest\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"credentials","dynamic":false,"spread":false}],[{"content":"manifest","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/credentials/manifest.ts","pathname":"/api/credentials/manifest","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/design/health","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/design\\/health\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"design","dynamic":false,"spread":false}],[{"content":"health","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/design/health.ts","pathname":"/api/design/health","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/design/[...path]","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/design(?:\\/(.*?))?\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"design","dynamic":false,"spread":false}],[{"content":"...path","dynamic":true,"spread":true}]],"params":["...path"],"component":"src/pages/api/design/[...path].ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/executions/[id]/events","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/executions\\/([^/]+?)\\/events\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"executions","dynamic":false,"spread":false}],[{"content":"id","dynamic":true,"spread":false}],[{"content":"events","dynamic":false,"spread":false}]],"params":["id"],"component":"src/pages/api/executions/[id]/events.ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/executions/[id]","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/executions\\/([^/]+?)\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"executions","dynamic":false,"spread":false}],[{"content":"id","dynamic":true,"spread":false}]],"params":["id"],"component":"src/pages/api/executions/[id].ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/executions","isIndex":true,"type":"endpoint","pattern":"^\\/api\\/executions\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"executions","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/executions/index.ts","pathname":"/api/executions","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/integrations/composio/callback","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/integrations\\/composio\\/callback\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"integrations","dynamic":false,"spread":false}],[{"content":"composio","dynamic":false,"spread":false}],[{"content":"callback","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/integrations/composio/callback.ts","pathname":"/api/integrations/composio/callback","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/integrations/[slotId]/connect","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/integrations\\/([^/]+?)\\/connect\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"integrations","dynamic":false,"spread":false}],[{"content":"slotId","dynamic":true,"spread":false}],[{"content":"connect","dynamic":false,"spread":false}]],"params":["slotId"],"component":"src/pages/api/integrations/[slotId]/connect.ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/integrations/[slotId]/credentials","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/integrations\\/([^/]+?)\\/credentials\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"integrations","dynamic":false,"spread":false}],[{"content":"slotId","dynamic":true,"spread":false}],[{"content":"credentials","dynamic":false,"spread":false}]],"params":["slotId"],"component":"src/pages/api/integrations/[slotId]/credentials.ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/integrations/[slotId]/disconnect","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/integrations\\/([^/]+?)\\/disconnect\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"integrations","dynamic":false,"spread":false}],[{"content":"slotId","dynamic":true,"spread":false}],[{"content":"disconnect","dynamic":false,"spread":false}]],"params":["slotId"],"component":"src/pages/api/integrations/[slotId]/disconnect.ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/library","isIndex":true,"type":"endpoint","pattern":"^\\/api\\/library\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"library","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/library/index.ts","pathname":"/api/library","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/observability/metrics","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/observability\\/metrics\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"observability","dynamic":false,"spread":false}],[{"content":"metrics","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/observability/metrics.ts","pathname":"/api/observability/metrics","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/projects/[id]","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/projects\\/([^/]+?)\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"projects","dynamic":false,"spread":false}],[{"content":"id","dynamic":true,"spread":false}]],"params":["id"],"component":"src/pages/api/projects/[id].ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/projects","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/projects\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"projects","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/projects.ts","pathname":"/api/projects","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/active-runs","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/active-runs\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"active-runs","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/active-runs.ts","pathname":"/api/runtime/active-runs","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/browser/action","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/browser\\/action\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"browser","dynamic":false,"spread":false}],[{"content":"action","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/browser/action.ts","pathname":"/api/runtime/browser/action","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/browser/cdp","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/browser\\/cdp\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"browser","dynamic":false,"spread":false}],[{"content":"cdp","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/browser/cdp.ts","pathname":"/api/runtime/browser/cdp","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/browser/session","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/browser\\/session\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"browser","dynamic":false,"spread":false}],[{"content":"session","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/browser/session.ts","pathname":"/api/runtime/browser/session","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/browser/stream","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/browser\\/stream\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"browser","dynamic":false,"spread":false}],[{"content":"stream","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/browser/stream.ts","pathname":"/api/runtime/browser/stream","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/commands","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/commands\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"commands","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/commands.ts","pathname":"/api/runtime/commands","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/computer-use/preview/action","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/computer-use\\/preview\\/action\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"computer-use","dynamic":false,"spread":false}],[{"content":"preview","dynamic":false,"spread":false}],[{"content":"action","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/computer-use/preview/action.ts","pathname":"/api/runtime/computer-use/preview/action","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/computer-use/preview/session","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/computer-use\\/preview\\/session\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"computer-use","dynamic":false,"spread":false}],[{"content":"preview","dynamic":false,"spread":false}],[{"content":"session","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/computer-use/preview/session.ts","pathname":"/api/runtime/computer-use/preview/session","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/computer-use/preview/stream","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/computer-use\\/preview\\/stream\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"computer-use","dynamic":false,"spread":false}],[{"content":"preview","dynamic":false,"spread":false}],[{"content":"stream","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/computer-use/preview/stream.ts","pathname":"/api/runtime/computer-use/preview/stream","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/computer-use/sandbox/action","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/computer-use\\/sandbox\\/action\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"computer-use","dynamic":false,"spread":false}],[{"content":"sandbox","dynamic":false,"spread":false}],[{"content":"action","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/computer-use/sandbox/action.ts","pathname":"/api/runtime/computer-use/sandbox/action","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/computer-use/sandbox/preflight","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/computer-use\\/sandbox\\/preflight\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"computer-use","dynamic":false,"spread":false}],[{"content":"sandbox","dynamic":false,"spread":false}],[{"content":"preflight","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/computer-use/sandbox/preflight.ts","pathname":"/api/runtime/computer-use/sandbox/preflight","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/computer-use/sandbox/status","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/computer-use\\/sandbox\\/status\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"computer-use","dynamic":false,"spread":false}],[{"content":"sandbox","dynamic":false,"spread":false}],[{"content":"status","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/computer-use/sandbox/status.ts","pathname":"/api/runtime/computer-use/sandbox/status","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/computer-use/session","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/computer-use\\/session\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"computer-use","dynamic":false,"spread":false}],[{"content":"session","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/computer-use/session.ts","pathname":"/api/runtime/computer-use/session","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/context-usage","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/context-usage\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"context-usage","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/context-usage.ts","pathname":"/api/runtime/context-usage","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/dispatch-health","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/dispatch-health\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"dispatch-health","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/dispatch-health.ts","pathname":"/api/runtime/dispatch-health","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/harness-spec","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/harness-spec\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"harness-spec","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/harness-spec.ts","pathname":"/api/runtime/harness-spec","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/hub/events","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/hub\\/events\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"hub","dynamic":false,"spread":false}],[{"content":"events","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/hub/events.ts","pathname":"/api/runtime/hub/events","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/observability","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/observability\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"observability","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/observability.ts","pathname":"/api/runtime/observability","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/readiness","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/readiness\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"readiness","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/readiness.ts","pathname":"/api/runtime/readiness","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/reconcile-auth","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/reconcile-auth\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"reconcile-auth","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/reconcile-auth.ts","pathname":"/api/runtime/reconcile-auth","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/runs/[runId]/attach","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/runs\\/([^/]+?)\\/attach\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"runs","dynamic":false,"spread":false}],[{"content":"runId","dynamic":true,"spread":false}],[{"content":"attach","dynamic":false,"spread":false}]],"params":["runId"],"component":"src/pages/api/runtime/runs/[runId]/attach.ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/runs/[runId]/cancel","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/runs\\/([^/]+?)\\/cancel\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"runs","dynamic":false,"spread":false}],[{"content":"runId","dynamic":true,"spread":false}],[{"content":"cancel","dynamic":false,"spread":false}]],"params":["runId"],"component":"src/pages/api/runtime/runs/[runId]/cancel.ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/runs/[runId]/diagnostics","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/runs\\/([^/]+?)\\/diagnostics\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"runs","dynamic":false,"spread":false}],[{"content":"runId","dynamic":true,"spread":false}],[{"content":"diagnostics","dynamic":false,"spread":false}]],"params":["runId"],"component":"src/pages/api/runtime/runs/[runId]/diagnostics.ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/runs/[runId]/reconcile","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/runs\\/([^/]+?)\\/reconcile\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"runs","dynamic":false,"spread":false}],[{"content":"runId","dynamic":true,"spread":false}],[{"content":"reconcile","dynamic":false,"spread":false}]],"params":["runId"],"component":"src/pages/api/runtime/runs/[runId]/reconcile.ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/shutdown","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/shutdown\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"shutdown","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/shutdown.ts","pathname":"/api/runtime/shutdown","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/stream","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/stream\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"stream","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/stream.ts","pathname":"/api/runtime/stream","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/transcribe","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/transcribe\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"transcribe","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/transcribe.ts","pathname":"/api/runtime/transcribe","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/ui/manifest","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/ui\\/manifest\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"ui","dynamic":false,"spread":false}],[{"content":"manifest","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/ui/manifest.ts","pathname":"/api/runtime/ui/manifest","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/upload","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/upload\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"upload","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/upload.ts","pathname":"/api/runtime/upload","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/runtime/voice/status","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/runtime\\/voice\\/status\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"runtime","dynamic":false,"spread":false}],[{"content":"voice","dynamic":false,"spread":false}],[{"content":"status","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/runtime/voice/status.ts","pathname":"/api/runtime/voice/status","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/schedules/[entryId]/run-now","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/schedules\\/([^/]+?)\\/run-now\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"schedules","dynamic":false,"spread":false}],[{"content":"entryId","dynamic":true,"spread":false}],[{"content":"run-now","dynamic":false,"spread":false}]],"params":["entryId"],"component":"src/pages/api/schedules/[entryId]/run-now.ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/schedules/[entryId]","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/schedules\\/([^/]+?)\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"schedules","dynamic":false,"spread":false}],[{"content":"entryId","dynamic":true,"spread":false}]],"params":["entryId"],"component":"src/pages/api/schedules/[entryId].ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/schedules","isIndex":true,"type":"endpoint","pattern":"^\\/api\\/schedules\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"schedules","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/schedules/index.ts","pathname":"/api/schedules","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/settings/computer-use/activate","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/settings\\/computer-use\\/activate\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"settings","dynamic":false,"spread":false}],[{"content":"computer-use","dynamic":false,"spread":false}],[{"content":"activate","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/settings/computer-use/activate.ts","pathname":"/api/settings/computer-use/activate","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/settings/computer-use/grant-permissions","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/settings\\/computer-use\\/grant-permissions\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"settings","dynamic":false,"spread":false}],[{"content":"computer-use","dynamic":false,"spread":false}],[{"content":"grant-permissions","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/settings/computer-use/grant-permissions.ts","pathname":"/api/settings/computer-use/grant-permissions","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/settings/computer-use","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/settings\\/computer-use\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"settings","dynamic":false,"spread":false}],[{"content":"computer-use","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/settings/computer-use.ts","pathname":"/api/settings/computer-use","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/settings/presentation","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/settings\\/presentation\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"settings","dynamic":false,"spread":false}],[{"content":"presentation","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/settings/presentation.ts","pathname":"/api/settings/presentation","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/settings","isIndex":true,"type":"endpoint","pattern":"^\\/api\\/settings\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"settings","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/settings/index.ts","pathname":"/api/settings","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/shell/bootstrap","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/shell\\/bootstrap\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"shell","dynamic":false,"spread":false}],[{"content":"bootstrap","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/shell/bootstrap.ts","pathname":"/api/shell/bootstrap","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/ui/brand-asset","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/ui\\/brand-asset\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"ui","dynamic":false,"spread":false}],[{"content":"brand-asset","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/ui/brand-asset.ts","pathname":"/api/ui/brand-asset","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/ui/composer-config","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/ui\\/composer-config\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"ui","dynamic":false,"spread":false}],[{"content":"composer-config","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/ui/composer-config.ts","pathname":"/api/ui/composer-config","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/ui/reader-preferences","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/ui\\/reader-preferences\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"ui","dynamic":false,"spread":false}],[{"content":"reader-preferences","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/ui/reader-preferences.ts","pathname":"/api/ui/reader-preferences","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/ui/right-panel","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/ui\\/right-panel\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"ui","dynamic":false,"spread":false}],[{"content":"right-panel","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/ui/right-panel.ts","pathname":"/api/ui/right-panel","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/ui/shell-layout","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/ui\\/shell-layout\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"ui","dynamic":false,"spread":false}],[{"content":"shell-layout","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/ui/shell-layout.ts","pathname":"/api/ui/shell-layout","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/workflows/[id]","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/workflows\\/([^/]+?)\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"workflows","dynamic":false,"spread":false}],[{"content":"id","dynamic":true,"spread":false}]],"params":["id"],"component":"src/pages/api/workflows/[id].ts","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/workflows","isIndex":true,"type":"endpoint","pattern":"^\\/api\\/workflows\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"workflows","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/workflows/index.ts","pathname":"/api/workflows","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/workspace/ensure-scratch","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/workspace\\/ensure-scratch\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"workspace","dynamic":false,"spread":false}],[{"content":"ensure-scratch","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/workspace/ensure-scratch.ts","pathname":"/api/workspace/ensure-scratch","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/workspace/file","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/workspace\\/file\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"workspace","dynamic":false,"spread":false}],[{"content":"file","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/workspace/file.ts","pathname":"/api/workspace/file","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/workspace/files","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/workspace\\/files\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"workspace","dynamic":false,"spread":false}],[{"content":"files","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/workspace/files.ts","pathname":"/api/workspace/files","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/artifact/[id]","isIndex":false,"type":"page","pattern":"^\\/artifact\\/([^/]+?)\\/?$","segments":[[{"content":"artifact","dynamic":false,"spread":false}],[{"content":"id","dynamic":true,"spread":false}]],"params":["id"],"component":"src/pages/artifact/[id].astro","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/conversation/[id]","isIndex":false,"type":"page","pattern":"^\\/conversation\\/([^/]+?)\\/?$","segments":[[{"content":"conversation","dynamic":false,"spread":false}],[{"content":"id","dynamic":true,"spread":false}]],"params":["id"],"component":"src/pages/conversation/[id].astro","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/dashboard","isIndex":false,"type":"page","pattern":"^\\/dashboard\\/?$","segments":[[{"content":"dashboard","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/dashboard.astro","pathname":"/dashboard","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/design","isIndex":true,"type":"page","pattern":"^\\/design\\/?$","segments":[[{"content":"design","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/design/index.astro","pathname":"/design","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/design/[...slug]","isIndex":false,"type":"page","pattern":"^\\/design(?:\\/(.*?))?\\/?$","segments":[[{"content":"design","dynamic":false,"spread":false}],[{"content":"...slug","dynamic":true,"spread":true}]],"params":["...slug"],"component":"src/pages/design/[...slug].astro","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/execution/[id]","isIndex":false,"type":"page","pattern":"^\\/execution\\/([^/]+?)\\/?$","segments":[[{"content":"execution","dynamic":false,"spread":false}],[{"content":"id","dynamic":true,"spread":false}]],"params":["id"],"component":"src/pages/execution/[id].astro","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/executions","isIndex":false,"type":"page","pattern":"^\\/executions\\/?$","segments":[[{"content":"executions","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/executions.astro","pathname":"/executions","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/integrations/composio/callback","isIndex":false,"type":"page","pattern":"^\\/integrations\\/composio\\/callback\\/?$","segments":[[{"content":"integrations","dynamic":false,"spread":false}],[{"content":"composio","dynamic":false,"spread":false}],[{"content":"callback","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/integrations/composio/callback.astro","pathname":"/integrations/composio/callback","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/library","isIndex":false,"type":"page","pattern":"^\\/library\\/?$","segments":[[{"content":"library","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/library.astro","pathname":"/library","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/project/[id]","isIndex":false,"type":"page","pattern":"^\\/project\\/([^/]+?)\\/?$","segments":[[{"content":"project","dynamic":false,"spread":false}],[{"content":"id","dynamic":true,"spread":false}]],"params":["id"],"component":"src/pages/project/[id].astro","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/projects","isIndex":false,"type":"page","pattern":"^\\/projects\\/?$","segments":[[{"content":"projects","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/projects.astro","pathname":"/projects","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/scheduled","isIndex":false,"type":"page","pattern":"^\\/scheduled\\/?$","segments":[[{"content":"scheduled","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/scheduled.astro","pathname":"/scheduled","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/settings","isIndex":false,"type":"page","pattern":"^\\/settings\\/?$","segments":[[{"content":"settings","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings.astro","pathname":"/settings","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/workflow/[id]","isIndex":false,"type":"page","pattern":"^\\/workflow\\/([^/]+?)\\/?$","segments":[[{"content":"workflow","dynamic":false,"spread":false}],[{"content":"id","dynamic":true,"spread":false}]],"params":["id"],"component":"src/pages/workflow/[id].astro","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"_astro/AppLayout.Bkx4XoN2.css"}],"routeData":{"route":"/","isIndex":true,"type":"page","pattern":"^\\/$","segments":[],"params":[],"component":"src/pages/index.astro","pathname":"/","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}}],"serverLike":true,"middlewareMode":"classic","base":"/","trailingSlash":"ignore","compressHTML":true,"experimentalQueuedRendering":{"enabled":false,"poolSize":0,"contentCache":false},"componentMetadata":[["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/design/[...slug].astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/design/index.astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/conversation/[id].astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/executions.astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/index.astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/library.astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/scheduled.astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/artifact/[id].astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/dashboard.astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/execution/[id].astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/project/[id].astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/projects.astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/settings.astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/workflow/[id].astro",{"propagation":"none","containsHead":true}],["/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/integrations/composio/callback.astro",{"propagation":"none","containsHead":true}]],"renderers":[],"clientDirectives":[["idle","(()=>{var l=(n,t)=>{let i=async()=>{await(await n())()},e=typeof t.value==\"object\"?t.value:void 0,s={timeout:e==null?void 0:e.timeout};\"requestIdleCallback\"in window?window.requestIdleCallback(i,s):setTimeout(i,s.timeout||200)};(self.Astro||(self.Astro={})).idle=l;window.dispatchEvent(new Event(\"astro:idle\"));})();"],["load","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).load=e;window.dispatchEvent(new Event(\"astro:load\"));})();"],["media","(()=>{var n=(a,t)=>{let i=async()=>{await(await a())()};if(t.value){let e=matchMedia(t.value);e.matches?i():e.addEventListener(\"change\",i,{once:!0})}};(self.Astro||(self.Astro={})).media=n;window.dispatchEvent(new Event(\"astro:media\"));})();"],["only","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).only=e;window.dispatchEvent(new Event(\"astro:only\"));})();"],["visible","(()=>{var a=(s,i,o)=>{let r=async()=>{await(await s())()},t=typeof i.value==\"object\"?i.value:void 0,c={rootMargin:t==null?void 0:t.rootMargin},n=new IntersectionObserver(e=>{for(let l of e)if(l.isIntersecting){n.disconnect(),r();break}},c);for(let e of o.children)n.observe(e)};(self.Astro||(self.Astro={})).visible=a;window.dispatchEvent(new Event(\"astro:visible\"));})();"]],"entryModules":{"astro/entrypoints/prerender":"prerender-entry.Mu_G_RPT.mjs","\u0000virtual:astro:actions/noop-entrypoint":"chunks/noop-entrypoint_BOlrdqWF.mjs","\u0000noop-middleware":"virtual_astro_middleware.mjs","\u0000virtual:astro:session-driver":"chunks/_virtual_astro_session-driver_Bk3Q189E.mjs","\u0000virtual:astro:server-island-manifest":"chunks/_virtual_astro_server-island-manifest_CQQ1F5PF.mjs","@astrojs/node/server.js":"entry.mjs","\u0000virtual:astro:page:src/pages/api/artifacts/[id]@_@ts":"chunks/_id__7zg0NQN-.mjs","\u0000virtual:astro:page:src/pages/api/artifacts/index@_@ts":"chunks/index_CYIHywiI.mjs","\u0000virtual:astro:page:src/pages/api/chat@_@ts":"chunks/chat_CoK7NTMo.mjs","\u0000virtual:astro:page:src/pages/api/context/widgets@_@ts":"chunks/widgets_DHyDwB5X.mjs","\u0000virtual:astro:page:src/pages/api/conversations/[id]@_@ts":"chunks/_id__CFYH6urZ.mjs","\u0000virtual:astro:page:src/pages/api/conversations@_@ts":"chunks/conversations_D99bh3wE.mjs","\u0000virtual:astro:page:src/pages/api/credentials/manifest@_@ts":"chunks/manifest_DHARiQ_j.mjs","\u0000virtual:astro:page:src/pages/api/design/health@_@ts":"chunks/health_Mvvy7p-W.mjs","\u0000virtual:astro:page:src/pages/api/design/[...path]@_@ts":"chunks/_.._CniBtTRb.mjs","\u0000virtual:astro:page:src/pages/api/executions/[id]/events@_@ts":"chunks/events_C_kPjtSt.mjs","\u0000virtual:astro:page:src/pages/api/executions/[id]@_@ts":"chunks/_id__1HKEhDfc.mjs","\u0000virtual:astro:page:src/pages/api/executions/index@_@ts":"chunks/index_Dj1fyow1.mjs","\u0000virtual:astro:page:src/pages/api/integrations/composio/callback@_@ts":"chunks/callback_BqvsG2vO.mjs","\u0000virtual:astro:page:src/pages/api/integrations/[slotId]/connect@_@ts":"chunks/connect_DbZuoVMV.mjs","\u0000virtual:astro:page:src/pages/api/integrations/[slotId]/credentials@_@ts":"chunks/credentials_DqnGhq7W.mjs","\u0000virtual:astro:page:src/pages/api/integrations/[slotId]/disconnect@_@ts":"chunks/disconnect_CJ4C_NCi.mjs","\u0000virtual:astro:page:src/pages/api/library/index@_@ts":"chunks/index_okPz9JUO.mjs","\u0000virtual:astro:page:src/pages/api/observability/metrics@_@ts":"chunks/metrics_Ci8iWeXt.mjs","\u0000virtual:astro:page:src/pages/api/projects/[id]@_@ts":"chunks/_id__DOzFjm9x.mjs","\u0000virtual:astro:page:src/pages/api/projects@_@ts":"chunks/projects_D1VkK5sz.mjs","\u0000virtual:astro:page:src/pages/api/runtime/active-runs@_@ts":"chunks/active-runs_CgDxXIi8.mjs","\u0000virtual:astro:page:src/pages/api/runtime/browser/action@_@ts":"chunks/action_DhIIl-RB.mjs","\u0000virtual:astro:page:src/pages/api/runtime/browser/cdp@_@ts":"chunks/cdp_2heYrAAY.mjs","\u0000virtual:astro:page:src/pages/api/runtime/browser/session@_@ts":"chunks/session_ZKXxpoLB.mjs","\u0000virtual:astro:page:src/pages/api/runtime/browser/stream@_@ts":"chunks/stream_DP_2ylcD.mjs","\u0000virtual:astro:page:src/pages/api/runtime/commands@_@ts":"chunks/commands_s5-Y_fIk.mjs","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/lib/runtime-computer-use-preferences.ts":"chunks/runtime-computer-use-preferences_NdHwuD2F.mjs","\u0000virtual:astro:page:src/pages/api/runtime/computer-use/preview/action@_@ts":"chunks/action_Dvb0x1jm.mjs","\u0000virtual:astro:page:src/pages/api/runtime/computer-use/preview/session@_@ts":"chunks/session_y7SFsaAZ.mjs","\u0000virtual:astro:page:src/pages/api/runtime/computer-use/preview/stream@_@ts":"chunks/stream_BBwu8FzY.mjs","\u0000virtual:astro:page:src/pages/api/runtime/computer-use/sandbox/action@_@ts":"chunks/action_BOxCXoIP.mjs","\u0000virtual:astro:page:src/pages/api/runtime/computer-use/sandbox/preflight@_@ts":"chunks/preflight_CHnLpXVg.mjs","\u0000virtual:astro:page:src/pages/api/runtime/computer-use/sandbox/status@_@ts":"chunks/status_KJ_eZD7m.mjs","\u0000virtual:astro:page:src/pages/api/runtime/computer-use/session@_@ts":"chunks/session_BBT8KhhD.mjs","\u0000virtual:astro:page:src/pages/api/runtime/context-usage@_@ts":"chunks/context-usage_2g0-pNJt.mjs","\u0000virtual:astro:page:src/pages/api/runtime/dispatch-health@_@ts":"chunks/dispatch-health_D8EKBM1u.mjs","\u0000virtual:astro:page:src/pages/api/runtime/harness-spec@_@ts":"chunks/harness-spec_C3pyoUBs.mjs","\u0000virtual:astro:page:src/pages/api/runtime/hub/events@_@ts":"chunks/events_CQEKeCDd.mjs","\u0000virtual:astro:page:src/pages/api/runtime/observability@_@ts":"chunks/observability_AnQlJLWD.mjs","\u0000virtual:astro:page:src/pages/api/runtime/readiness@_@ts":"chunks/readiness_mO_WXNul.mjs","\u0000virtual:astro:page:src/pages/api/runtime/reconcile-auth@_@ts":"chunks/reconcile-auth_CzRHFNUX.mjs","\u0000virtual:astro:page:src/pages/api/runtime/runs/[runId]/attach@_@ts":"chunks/attach_DvImd1Sr.mjs","\u0000virtual:astro:page:src/pages/api/runtime/runs/[runId]/cancel@_@ts":"chunks/cancel_CiDhfgh1.mjs","\u0000virtual:astro:page:src/pages/api/runtime/runs/[runId]/diagnostics@_@ts":"chunks/diagnostics_r9HJKePM.mjs","\u0000virtual:astro:page:src/pages/api/runtime/runs/[runId]/reconcile@_@ts":"chunks/reconcile_DhLAi8B4.mjs","\u0000virtual:astro:page:src/pages/api/runtime/shutdown@_@ts":"chunks/shutdown_CBP_-PiK.mjs","\u0000virtual:astro:page:src/pages/api/runtime/stream@_@ts":"chunks/stream_DWf2qN6c.mjs","\u0000virtual:astro:page:src/pages/api/runtime/transcribe@_@ts":"chunks/transcribe_BoD77Keq.mjs","\u0000virtual:astro:page:src/pages/api/runtime/ui/manifest@_@ts":"chunks/manifest_BXczaknd.mjs","\u0000virtual:astro:page:src/pages/api/runtime/upload@_@ts":"chunks/upload_BVLtvHHx.mjs","\u0000virtual:astro:page:src/pages/api/runtime/voice/status@_@ts":"chunks/status_CeUk5OTt.mjs","\u0000virtual:astro:page:src/pages/api/schedules/[entryId]/run-now@_@ts":"chunks/run-now_BPzfyXOp.mjs","\u0000virtual:astro:page:src/pages/api/schedules/[entryId]@_@ts":"chunks/_entryId__81wk16PN.mjs","\u0000virtual:astro:page:src/pages/api/schedules/index@_@ts":"chunks/index_BJCclhco.mjs","\u0000virtual:astro:page:src/pages/api/settings/computer-use/activate@_@ts":"chunks/activate_MxRRK9SF.mjs","\u0000virtual:astro:page:src/pages/api/settings/computer-use/grant-permissions@_@ts":"chunks/grant-permissions_5GTKVC8Q.mjs","\u0000virtual:astro:page:src/pages/api/settings/computer-use@_@ts":"chunks/computer-use_BPiPpZRq.mjs","\u0000virtual:astro:page:src/pages/api/settings/presentation@_@ts":"chunks/presentation_DiBHiNfe.mjs","\u0000virtual:astro:page:src/pages/api/settings/index@_@ts":"chunks/index_BRezsJEq.mjs","\u0000virtual:astro:page:src/pages/api/shell/bootstrap@_@ts":"chunks/bootstrap_C4JKMd9m.mjs","\u0000virtual:astro:page:src/pages/api/ui/brand-asset@_@ts":"chunks/brand-asset_D5sf0kiQ.mjs","\u0000virtual:astro:page:src/pages/api/ui/composer-config@_@ts":"chunks/composer-config_BI2WK837.mjs","\u0000virtual:astro:page:src/pages/api/ui/reader-preferences@_@ts":"chunks/reader-preferences_BK37sD5d.mjs","\u0000virtual:astro:page:src/pages/api/ui/right-panel@_@ts":"chunks/right-panel_BSzBi47a.mjs","\u0000virtual:astro:page:src/pages/api/ui/shell-layout@_@ts":"chunks/shell-layout_MXzxCKcA.mjs","\u0000virtual:astro:page:src/pages/api/workflows/[id]@_@ts":"chunks/_id__DqYItgNl.mjs","\u0000virtual:astro:page:src/pages/api/workflows/index@_@ts":"chunks/index_BqP25PnD.mjs","\u0000virtual:astro:page:src/pages/api/workspace/ensure-scratch@_@ts":"chunks/ensure-scratch_BpQkbqMx.mjs","\u0000virtual:astro:page:src/pages/api/workspace/file@_@ts":"chunks/file_CcAYq0K4.mjs","\u0000virtual:astro:page:src/pages/api/workspace/files@_@ts":"chunks/files_BllB-Ufw.mjs","\u0000virtual:astro:page:src/pages/artifact/[id]@_@astro":"chunks/_id__DuwT5dkl.mjs","\u0000virtual:astro:page:src/pages/conversation/[id]@_@astro":"chunks/_id__CaNApmhB.mjs","\u0000virtual:astro:page:src/pages/dashboard@_@astro":"chunks/dashboard_CDxbI2jZ.mjs","\u0000virtual:astro:page:src/pages/design/index@_@astro":"chunks/index_DE-NqqD4.mjs","\u0000virtual:astro:page:src/pages/design/[...slug]@_@astro":"chunks/_.._Bv6gomnH.mjs","\u0000virtual:astro:page:src/pages/execution/[id]@_@astro":"chunks/_id__DLjQZ0BV.mjs","\u0000virtual:astro:page:src/pages/executions@_@astro":"chunks/executions_COWaAJA6.mjs","\u0000virtual:astro:page:src/pages/integrations/composio/callback@_@astro":"chunks/callback_EmKYBrtl.mjs","\u0000virtual:astro:page:src/pages/library@_@astro":"chunks/library_BwRSLqYW.mjs","\u0000virtual:astro:page:src/pages/project/[id]@_@astro":"chunks/_id__C-6yc8GT.mjs","\u0000virtual:astro:page:src/pages/projects@_@astro":"chunks/projects_q6FLkKDA.mjs","\u0000virtual:astro:page:src/pages/scheduled@_@astro":"chunks/scheduled_rAvTHkyv.mjs","\u0000virtual:astro:page:src/pages/settings@_@astro":"chunks/settings_CLxxXwm7.mjs","\u0000virtual:astro:page:src/pages/workflow/[id]@_@astro":"chunks/_id__zY9Z3zc4.mjs","\u0000virtual:astro:page:src/pages/index@_@astro":"chunks/index_akbJP8Zl.mjs","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/astro/dist/assets/services/sharp.js":"chunks/sharp_BzkDGTD0.mjs","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/components/react/ArtifactSpreadsheetPreview.tsx":"_astro/ArtifactSpreadsheetPreview.Oex17fA7.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/components/react/ArtifactDocxPreview.tsx":"_astro/ArtifactDocxPreview.ir0OOlZb.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/components/react/ArtifactPptxPreview.tsx":"_astro/ArtifactPptxPreview.Ju7hAROu.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/components/react/ArtifactModel3DPreview.tsx":"_astro/ArtifactModel3DPreview.LopsTkJx.js","\u0000astro:transitions/client":"_astro/client.LtOrxvrW.js","@astrojs/react/client.js":"_astro/client.CFaxWv9L.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@tauri-apps/api/window.js":"_astro/window.CTezTnwM.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@tauri-apps/plugin-shell/dist-js/index.js":"_astro/index.B4XecE38.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/shiki/dist/index.mjs":"_astro/index.DaCY4rV6.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/xlsx/xlsx.mjs":"_astro/xlsx.CNerDvZX.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/abap.mjs":"_astro/abap.BdImnpbu.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/actionscript-3.mjs":"_astro/actionscript-3.CoDkCxhg.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/ada.mjs":"_astro/ada.bCR0ucgS.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/angular-ts.mjs":"_astro/angular-ts.Er5fI0Sc.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/apache.mjs":"_astro/apache.Pmp26Uib.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/apex.mjs":"_astro/apex.Dqspr-GT.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/apl.mjs":"_astro/apl.Dkwu3-1V.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/applescript.mjs":"_astro/applescript.Co6uUVPk.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/ara.mjs":"_astro/ara.BRHolxvo.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/asciidoc.mjs":"_astro/asciidoc.Ve4PFQV2.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/asm.mjs":"_astro/asm.D_Q5rh1f.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/astro.mjs":"_astro/astro.Ts5EKq2l.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/awk.mjs":"_astro/awk.DMzUqQB5.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/ballerina.mjs":"_astro/ballerina.BFfxhgS-.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/bat.mjs":"_astro/bat.BkioyH1T.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/beancount.mjs":"_astro/beancount.k_qm7-4y.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/berry.mjs":"_astro/berry.uYugtg8r.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/bibtex.mjs":"_astro/bibtex.CHM0blh-.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/bicep.mjs":"_astro/bicep.Bmn6On1c.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/html.mjs":"_astro/html.QW0909HF.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/javascript.mjs":"_astro/javascript.wDzz0qaB.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/css.mjs":"_astro/css.CLj8gQPS.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/scss.mjs":"_astro/scss.CcblZge7.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/xml.mjs":"_astro/xml.CzC_-KeP.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/json.mjs":"_astro/json.Cp-IABpG.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/java.mjs":"_astro/java.CylS5w8V.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/typescript.mjs":"_astro/typescript.BPQ3VLAy.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/postcss.mjs":"_astro/postcss.CXtECtnM.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/tsx.mjs":"_astro/tsx.COt5Ahok.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/bird2.mjs":"_astro/bird2.BIv1doCn.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/blade.mjs":"_astro/blade.DuIMWPzx.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/html-derivative.mjs":"_astro/html-derivative.Jn_18P7D.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/sql.mjs":"_astro/sql.CRqJ_cUM.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/bsl.mjs":"_astro/bsl.CQ-hWmPL.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/sdbl.mjs":"_astro/sdbl.DVxCFoDh.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/c.mjs":"_astro/c.BIGW1oBm.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/c3.mjs":"_astro/c3.MRO5bC_T.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/cadence.mjs":"_astro/cadence.Bv_4Rxtq.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/cairo.mjs":"_astro/cairo.B2qsAHtI.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/python.mjs":"_astro/python.B6aJPvgy.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/clarity.mjs":"_astro/clarity.D53aC0YG.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/clojure.mjs":"_astro/clojure.P80f7IUj.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/cmake.mjs":"_astro/cmake.D1j8_8rp.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/cobol.mjs":"_astro/cobol.CprMWL7q.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/codeowners.mjs":"_astro/codeowners.Bp6g37R7.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/codeql.mjs":"_astro/codeql.DsOJ9woJ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/coffee.mjs":"_astro/coffee.DKmKaF_c.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/common-lisp.mjs":"_astro/common-lisp.Cg-RD9OK.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/coq.mjs":"_astro/coq.DkFqJrB1.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/cpp.mjs":"_astro/cpp.CeZIWt43.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/regexp.mjs":"_astro/regexp.CDVJQ6XC.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/glsl.mjs":"_astro/glsl.DyqZbVRN.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/crystal.mjs":"_astro/crystal.NWeDlFfX.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/shellscript.mjs":"_astro/shellscript.Yzrsuije.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/csharp.mjs":"_astro/csharp.DSvCPggb.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/csv.mjs":"_astro/csv.fuZLfV_i.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/cue.mjs":"_astro/cue.D82EKSYY.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/cypher.mjs":"_astro/cypher.COkxafJQ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/d.mjs":"_astro/d.85-TOEBH.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/dart.mjs":"_astro/dart.bE4Kk8sk.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/dax.mjs":"_astro/dax.CEL-wOlO.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/desktop.mjs":"_astro/desktop.BmXAJ9_W.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/diff.mjs":"_astro/diff.D97Zzqfu.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/docker.mjs":"_astro/docker.BcOcwvcX.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/dotenv.mjs":"_astro/dotenv.Da5cRb03.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/dream-maker.mjs":"_astro/dream-maker.BtqSS_iP.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/edge.mjs":"_astro/edge.VcuOVms0.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/elixir.mjs":"_astro/elixir.B1Ue_5mm.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/elm.mjs":"_astro/elm.Dl8LO6Cw.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/emacs-lisp.mjs":"_astro/emacs-lisp.CXvaQtF9.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/erb.mjs":"_astro/erb.CwJgrsgL.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/ruby.mjs":"_astro/ruby.CoKQ_x1T.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/haml.mjs":"_astro/haml.CKNntyJD.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/graphql.mjs":"_astro/graphql.BG5Wfmbq.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/lua.mjs":"_astro/lua.DRn5k6VU.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/yaml.mjs":"_astro/yaml.Buea-lGh.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/jsx.mjs":"_astro/jsx.g9-lgVsj.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/erlang.mjs":"_astro/erlang.ImAjNfjq.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/markdown.mjs":"_astro/markdown.Cvjx9yec.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/fennel.mjs":"_astro/fennel.BYunw83y.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/fish.mjs":"_astro/fish.BvzEVeQv.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/fluent.mjs":"_astro/fluent.C4IJs8-o.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/fortran-fixed-form.mjs":"_astro/fortran-fixed-form.VAL6vgx9.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/fortran-free-form.mjs":"_astro/fortran-free-form.BxgE0vQu.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/fsharp.mjs":"_astro/fsharp.DtkzXLn2.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/gdresource.mjs":"_astro/gdresource.iFKcIJq0.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/gdshader.mjs":"_astro/gdshader.DkwncUOv.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/gdscript.mjs":"_astro/gdscript.C5YyOfLZ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/genie.mjs":"_astro/genie.D0YGMca9.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/gherkin.mjs":"_astro/gherkin.DyxjwDmM.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/git-commit.mjs":"_astro/git-commit.ZvBw70vl.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/git-rebase.mjs":"_astro/git-rebase.CgB5NAD0.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/gleam.mjs":"_astro/gleam.BspZqrRM.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/glimmer-js.mjs":"_astro/glimmer-js.D1eqLnLL.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/glimmer-ts.mjs":"_astro/glimmer-ts.2bsbny7_.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/gn.mjs":"_astro/gn.n2N0HUVH.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/gnuplot.mjs":"_astro/gnuplot.DdkO51Og.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/go.mjs":"_astro/go.C27-OAKa.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/groovy.mjs":"_astro/groovy.gcz8RCvz.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/hack.mjs":"_astro/hack.DumbXoZH.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/handlebars.mjs":"_astro/handlebars.CyUR32XF.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/haskell.mjs":"_astro/haskell.Df6bDoY_.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/haxe.mjs":"_astro/haxe.CzTSHFRz.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/hcl.mjs":"_astro/hcl.BWvSN4gD.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/hjson.mjs":"_astro/hjson.D5-asLiD.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/hlsl.mjs":"_astro/hlsl.D3lLCCz7.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/http.mjs":"_astro/http.BtUIaMwx.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/hurl.mjs":"_astro/hurl.U6HWahqM.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/hxml.mjs":"_astro/hxml.D1AJYkwz.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/hy.mjs":"_astro/hy.DFXneXwc.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/imba.mjs":"_astro/imba.DGztddWO.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/ini.mjs":"_astro/ini.BEwlwnbL.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/jinja.mjs":"_astro/jinja.C8GEHRir.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/jison.mjs":"_astro/jison.DVLNWbJO.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/json5.mjs":"_astro/json5.C9tS-k6U.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/jsonc.mjs":"_astro/jsonc.Des-eS-w.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/jsonl.mjs":"_astro/jsonl.DcaNXYhu.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/jsonnet.mjs":"_astro/jsonnet.DFQXde-d.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/jssm.mjs":"_astro/jssm.C2t-YnRu.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/julia.mjs":"_astro/julia.C_P9pjDC.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/r.mjs":"_astro/r.Dspwwk_N.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/just.mjs":"_astro/just.B3KmxxRJ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/perl.mjs":"_astro/perl.D1SIrzVG.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/kdl.mjs":"_astro/kdl.DV7GczEv.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/kotlin.mjs":"_astro/kotlin.BdnUsdx6.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/kusto.mjs":"_astro/kusto.wEQ09or8.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/latex.mjs":"_astro/latex.CfQlEqvu.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/tex.mjs":"_astro/tex.NTV6TB-1.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/lean.mjs":"_astro/lean.BZvkOJ9d.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/less.mjs":"_astro/less.B1dDrJ26.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/liquid.mjs":"_astro/liquid.DgzZE9DL.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/llvm.mjs":"_astro/llvm.DjAJT7YJ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/log.mjs":"_astro/log.2UxHyX5q.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/logo.mjs":"_astro/logo.BtOb2qkB.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/luau.mjs":"_astro/luau.KW6xsasC.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/make.mjs":"_astro/make.CHLpvVh8.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/marko.mjs":"_astro/marko.DCAGaY4B.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/matlab.mjs":"_astro/matlab.D7o27uSR.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/mdc.mjs":"_astro/mdc.Dsm3NULF.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/mdx.mjs":"_astro/mdx.Cmh6b_Ma.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/mermaid.mjs":"_astro/mermaid.mWjccvbQ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/mipsasm.mjs":"_astro/mipsasm.CKIfxQSi.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/mojo.mjs":"_astro/mojo.rZm6bMo-.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/moonbit.mjs":"_astro/moonbit._H4v1dQx.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/move.mjs":"_astro/move.IF9eRakj.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/narrat.mjs":"_astro/narrat.DRg8JJMk.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/nextflow.mjs":"_astro/nextflow.G7hYJypm.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/nextflow-groovy.mjs":"_astro/nextflow-groovy.vE_lwT2v.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/nginx.mjs":"_astro/nginx.BblOZO6J.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/nim.mjs":"_astro/nim.6P6MGcUZ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/nix.mjs":"_astro/nix.CwoSXNpI.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/nushell.mjs":"_astro/nushell.Cz2AlsmD.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/objective-c.mjs":"_astro/objective-c.DXmwc3jG.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/objective-cpp.mjs":"_astro/objective-cpp.CLxacb5B.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/ocaml.mjs":"_astro/ocaml.C0hk2d4L.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/odin.mjs":"_astro/odin.BBf5iR-q.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/openscad.mjs":"_astro/openscad.C4EeE6gA.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/pascal.mjs":"_astro/pascal.D93ZcfNL.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/php.mjs":"_astro/php.yYn84ZJR.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/pkl.mjs":"_astro/pkl.u5AG7uiY.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/plsql.mjs":"_astro/plsql.ChMvpjG-.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/po.mjs":"_astro/po.BTJTHyun.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/polar.mjs":"_astro/polar.C0HS_06l.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/powerquery.mjs":"_astro/powerquery.CEu0bR-o.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/powershell.mjs":"_astro/powershell.Dpen1YoG.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/prisma.mjs":"_astro/prisma.Dd19v3D-.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/prolog.mjs":"_astro/prolog.CbFg5uaA.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/proto.mjs":"_astro/proto.C7zT0LnQ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/pug.mjs":"_astro/pug.DrS1a_C2.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/puppet.mjs":"_astro/puppet.BMWR74SV.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/purescript.mjs":"_astro/purescript.CklMAg4u.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/qml.mjs":"_astro/qml.Bn7K45KN.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/qmldir.mjs":"_astro/qmldir.C8lEn-DE.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/qss.mjs":"_astro/qss.IeuSbFQv.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/racket.mjs":"_astro/racket.BqYA7rlc.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/raku.mjs":"_astro/raku.DXvB9xmW.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/razor.mjs":"_astro/razor.B-nF4ujN.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/reg.mjs":"_astro/reg.C-SQnVFl.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/rel.mjs":"_astro/rel.C3B-1QV4.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/riscv.mjs":"_astro/riscv.BM1_JUlF.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/ron.mjs":"_astro/ron.D8l8udqQ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/rosmsg.mjs":"_astro/rosmsg.BJDFO7_C.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/rst.mjs":"_astro/rst.S16V7Rkb.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/rust.mjs":"_astro/rust.B1yitclQ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/sas.mjs":"_astro/sas.Dc9gSVXr.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/sass.mjs":"_astro/sass.Cj5Yp3dK.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/scala.mjs":"_astro/scala.C151Ov-r.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/scheme.mjs":"_astro/scheme.C98Dy4si.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/shaderlab.mjs":"_astro/shaderlab.yPvxg9J0.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/shellsession.mjs":"_astro/shellsession.caH0oxFO.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/smalltalk.mjs":"_astro/smalltalk.BERRCDM3.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/solidity.mjs":"_astro/solidity.rGO070M0.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/soy.mjs":"_astro/soy.CwPW4r5n.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/sparql.mjs":"_astro/sparql.DjVdNVty.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/turtle.mjs":"_astro/turtle.BsS91CYL.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/splunk.mjs":"_astro/splunk.BtCnVYZw.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/ssh-config.mjs":"_astro/ssh-config._ykCGR6B.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/stata.mjs":"_astro/stata.3K7hjnwR.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/stylus.mjs":"_astro/stylus.BEDo0Tqx.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/surrealql.mjs":"_astro/surrealql.BJ-4anmD.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/svelte.mjs":"_astro/svelte.DszoPEZd.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/swift.mjs":"_astro/swift.D82vCrfD.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/system-verilog.mjs":"_astro/system-verilog.CnnmHF94.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/systemd.mjs":"_astro/systemd.4A_iFExJ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/talonscript.mjs":"_astro/talonscript.CkByrt1z.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/tasl.mjs":"_astro/tasl.QIJgUcNo.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/tcl.mjs":"_astro/tcl.dwOrl1Do.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/templ.mjs":"_astro/templ.NAdjHxDV.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/terraform.mjs":"_astro/terraform.BETggiCN.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/toml.mjs":"_astro/toml.vGWfd6FD.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/ts-tags.mjs":"_astro/ts-tags.Dd8duizY.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/tsv.mjs":"_astro/tsv.B_m7g4N7.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/twig.mjs":"_astro/twig.D2_2f7L2.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/typespec.mjs":"_astro/typespec.CAFt9gP4.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/typst.mjs":"_astro/typst.DHCkPAjA.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/v.mjs":"_astro/v.BcVCzyr7.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/vala.mjs":"_astro/vala.CsfeWuGM.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/vb.mjs":"_astro/vb.D17OF-Vu.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/verilog.mjs":"_astro/verilog.BQ8w6xss.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/vhdl.mjs":"_astro/vhdl.CeAyd5Ju.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/viml.mjs":"_astro/viml.CJc9bBzg.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/vue.mjs":"_astro/vue.LmlDJ_T2.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/vue-html.mjs":"_astro/vue-html.Bn4RB85F.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/vue-vine.mjs":"_astro/vue-vine.Cf8QsMmp.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/vyper.mjs":"_astro/vyper.CDx5xZoG.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/wasm.mjs":"_astro/wasm.MzD3tlZU.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/wenyan.mjs":"_astro/wenyan.BV7otONQ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/wgsl.mjs":"_astro/wgsl.Dx-B1_4e.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/wikitext.mjs":"_astro/wikitext.BhOHFoWU.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/wit.mjs":"_astro/wit.5i3qLPDT.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/wolfram.mjs":"_astro/wolfram.lXgVvXCa.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/xsl.mjs":"_astro/xsl.DhWfo-gc.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/zenscript.mjs":"_astro/zenscript.DVFEvuxE.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/langs/dist/zig.mjs":"_astro/zig.VOosw3JB.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/andromeeda.mjs":"_astro/andromeeda.C4gqWexZ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/aurora-x.mjs":"_astro/aurora-x.D-2ljcwZ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/ayu-dark.mjs":"_astro/ayu-dark.DYE7WIF3.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/ayu-light.mjs":"_astro/ayu-light.BA47KaF1.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/ayu-mirage.mjs":"_astro/ayu-mirage.32ctXXKs.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/catppuccin-frappe.mjs":"_astro/catppuccin-frappe.DFWUc33u.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/catppuccin-latte.mjs":"_astro/catppuccin-latte.C9dUb6Cb.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/catppuccin-macchiato.mjs":"_astro/catppuccin-macchiato.DQyhUUbL.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/catppuccin-mocha.mjs":"_astro/catppuccin-mocha.D87Tk5Gz.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/dark-plus.mjs":"_astro/dark-plus.C3mMm8J8.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/dracula.mjs":"_astro/dracula.BzJJZx-M.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/dracula-soft.mjs":"_astro/dracula-soft.BXkSAIEj.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/everforest-dark.mjs":"_astro/everforest-dark.BgDCqdQA.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/everforest-light.mjs":"_astro/everforest-light.C8M2exoo.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/github-dark.mjs":"_astro/github-dark.DHJKELXO.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/github-dark-default.mjs":"_astro/github-dark-default.Cuk6v7N8.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/github-dark-dimmed.mjs":"_astro/github-dark-dimmed.DH5Ifo-i.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/github-dark-high-contrast.mjs":"_astro/github-dark-high-contrast.E3gJ1_iC.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/github-light.mjs":"_astro/github-light.DAi9KRSo.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/github-light-default.mjs":"_astro/github-light-default.D7oLnXFd.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/github-light-high-contrast.mjs":"_astro/github-light-high-contrast.BfjtVDDH.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/gruvbox-dark-hard.mjs":"_astro/gruvbox-dark-hard.CFHQjOhq.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/gruvbox-dark-medium.mjs":"_astro/gruvbox-dark-medium.GsRaNv29.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/gruvbox-dark-soft.mjs":"_astro/gruvbox-dark-soft.CVdnzihN.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/gruvbox-light-hard.mjs":"_astro/gruvbox-light-hard.CH1njM8p.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/gruvbox-light-medium.mjs":"_astro/gruvbox-light-medium.DRw_LuNl.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/gruvbox-light-soft.mjs":"_astro/gruvbox-light-soft.hJgmCMqR.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/horizon.mjs":"_astro/horizon.BUw7H-hv.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/horizon-bright.mjs":"_astro/horizon-bright.CUuTKBJd.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/houston.mjs":"_astro/houston.DnULxvSX.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/kanagawa-dragon.mjs":"_astro/kanagawa-dragon.CkXjmgJE.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/kanagawa-lotus.mjs":"_astro/kanagawa-lotus.CfQXZHmo.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/kanagawa-wave.mjs":"_astro/kanagawa-wave.DWedfzmr.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/laserwave.mjs":"_astro/laserwave.DUszq2jm.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/light-plus.mjs":"_astro/light-plus.B7mTdjB0.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/material-theme.mjs":"_astro/material-theme.D5KoaKCx.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/material-theme-darker.mjs":"_astro/material-theme-darker.BfHTSMKl.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/material-theme-lighter.mjs":"_astro/material-theme-lighter.B0m2ddpp.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/material-theme-ocean.mjs":"_astro/material-theme-ocean.CyktbL80.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/material-theme-palenight.mjs":"_astro/material-theme-palenight.Csfq5Kiy.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/min-dark.mjs":"_astro/min-dark.CafNBF8u.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/min-light.mjs":"_astro/min-light.CTRr51gU.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/monokai.mjs":"_astro/monokai.D4h5O-jR.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/night-owl.mjs":"_astro/night-owl.C39BiMTA.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/night-owl-light.mjs":"_astro/night-owl-light.CMTm3GFP.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/nord.mjs":"_astro/nord.Ddv68eIx.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/one-dark-pro.mjs":"_astro/one-dark-pro.DVMEJ2y_.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/one-light.mjs":"_astro/one-light.C3Wv6jpd.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/plastic.mjs":"_astro/plastic.3e1v2bzS.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/poimandres.mjs":"_astro/poimandres.CS3Unz2-.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/red.mjs":"_astro/red.bN70gL4F.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/rose-pine.mjs":"_astro/rose-pine.qdsjHGoJ.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/rose-pine-dawn.mjs":"_astro/rose-pine-dawn.DHQR4-dF.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/rose-pine-moon.mjs":"_astro/rose-pine-moon.D4_iv3hh.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/slack-dark.mjs":"_astro/slack-dark.BthQWCQV.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/slack-ochin.mjs":"_astro/slack-ochin.DqwNpetd.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/snazzy-light.mjs":"_astro/snazzy-light.Bw305WKR.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/solarized-dark.mjs":"_astro/solarized-dark.DXbdFlpD.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/solarized-light.mjs":"_astro/solarized-light.L9t79GZl.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/synthwave-84.mjs":"_astro/synthwave-84.CbfX1IO0.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/tokyo-night.mjs":"_astro/tokyo-night.hegEt444.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/vesper.mjs":"_astro/vesper.DRje8inN.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/vitesse-black.mjs":"_astro/vitesse-black.Bkuqu6BP.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/vitesse-dark.mjs":"_astro/vitesse-dark.D0r3Knsf.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/@shikijs/themes/dist/vitesse-light.mjs":"_astro/vitesse-light.CVO1_9PV.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/shiki/dist/wasm.mjs":"_astro/wasm.CG6Dc4jp.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/components/react/design/DesignShell":"_astro/DesignShell.CRkvvVwH.js","/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/components/react/ExecutionsListView":"_astro/ExecutionsListView.RglBh2vy.js","astro:scripts/before-hydration.js":""},"inlinedScripts":[],"assets":["/brand/icon-dark.png","/brand/icon-light.png","/brand/logo-dark.png","/brand/logo-light.png","/brand/wordmark-dark.png","/brand/wordmark-light.png","/_astro/ArtifactDocxPreview.ir0OOlZb.js","/_astro/ArtifactModel3DPreview.LopsTkJx.js","/_astro/ArtifactPptxPreview.Ju7hAROu.js","/_astro/ArtifactSpreadsheetPreview.Oex17fA7.js","/_astro/DesignShell.Bk3gyhyL.js","/_astro/DesignShell.CRkvvVwH.js","/_astro/ExecutionsListView.BZULHfsG.js","/_astro/ExecutionsListView.RglBh2vy.js","/_astro/abap.BdImnpbu.js","/_astro/actionscript-3.CoDkCxhg.js","/_astro/ada.bCR0ucgS.js","/_astro/andromeeda.C4gqWexZ.js","/_astro/angular-html.BiF-vEWo.js","/_astro/angular-ts.Er5fI0Sc.js","/_astro/apache.Pmp26Uib.js","/_astro/apex.Dqspr-GT.js","/_astro/apl.Dkwu3-1V.js","/_astro/applescript.Co6uUVPk.js","/_astro/ara.BRHolxvo.js","/_astro/artifact-preview-modes.CsL46fE3.js","/_astro/asciidoc.Ve4PFQV2.js","/_astro/asm.D_Q5rh1f.js","/_astro/astro.Ts5EKq2l.js","/_astro/aurora-x.D-2ljcwZ.js","/_astro/awk.DMzUqQB5.js","/_astro/ayu-dark.DYE7WIF3.js","/_astro/ayu-light.BA47KaF1.js","/_astro/ayu-mirage.32ctXXKs.js","/_astro/ballerina.BFfxhgS-.js","/_astro/bat.BkioyH1T.js","/_astro/beancount.k_qm7-4y.js","/_astro/berry.uYugtg8r.js","/_astro/bibtex.CHM0blh-.js","/_astro/bicep.Bmn6On1c.js","/_astro/bird2.BIv1doCn.js","/_astro/blade.DuIMWPzx.js","/_astro/bsl.CQ-hWmPL.js","/_astro/c.BIGW1oBm.js","/_astro/c3.MRO5bC_T.js","/_astro/cadence.Bv_4Rxtq.js","/_astro/cairo.B2qsAHtI.js","/_astro/catppuccin-frappe.DFWUc33u.js","/_astro/catppuccin-latte.C9dUb6Cb.js","/_astro/catppuccin-macchiato.DQyhUUbL.js","/_astro/catppuccin-mocha.D87Tk5Gz.js","/_astro/clarity.D53aC0YG.js","/_astro/client.CFaxWv9L.js","/_astro/client.LtOrxvrW.js","/_astro/clojure.P80f7IUj.js","/_astro/cmake.D1j8_8rp.js","/_astro/cobol.CprMWL7q.js","/_astro/codeowners.Bp6g37R7.js","/_astro/codeql.DsOJ9woJ.js","/_astro/coffee.DKmKaF_c.js","/_astro/common-lisp.Cg-RD9OK.js","/_astro/coq.DkFqJrB1.js","/_astro/core.Cn4yfEqx.js","/_astro/cpp.CeZIWt43.js","/_astro/crystal.NWeDlFfX.js","/_astro/csharp.DSvCPggb.js","/_astro/css.CLj8gQPS.js","/_astro/csv.fuZLfV_i.js","/_astro/cue.D82EKSYY.js","/_astro/cypher.COkxafJQ.js","/_astro/d.85-TOEBH.js","/_astro/dark-plus.C3mMm8J8.js","/_astro/dart.bE4Kk8sk.js","/_astro/dax.CEL-wOlO.js","/_astro/desktop.BmXAJ9_W.js","/_astro/diff.D97Zzqfu.js","/_astro/docker.BcOcwvcX.js","/_astro/dotenv.Da5cRb03.js","/_astro/dracula-soft.BXkSAIEj.js","/_astro/dracula.BzJJZx-M.js","/_astro/dream-maker.BtqSS_iP.js","/_astro/edge.VcuOVms0.js","/_astro/elixir.B1Ue_5mm.js","/_astro/elm.Dl8LO6Cw.js","/_astro/emacs-lisp.CXvaQtF9.js","/_astro/erb.CwJgrsgL.js","/_astro/erlang.ImAjNfjq.js","/_astro/everforest-dark.BgDCqdQA.js","/_astro/everforest-light.C8M2exoo.js","/_astro/fennel.BYunw83y.js","/_astro/fish.BvzEVeQv.js","/_astro/fluent.C4IJs8-o.js","/_astro/fortran-fixed-form.VAL6vgx9.js","/_astro/fortran-free-form.BxgE0vQu.js","/_astro/fsharp.DtkzXLn2.js","/_astro/gdresource.iFKcIJq0.js","/_astro/gdscript.C5YyOfLZ.js","/_astro/gdshader.DkwncUOv.js","/_astro/genie.D0YGMca9.js","/_astro/gherkin.DyxjwDmM.js","/_astro/git-commit.ZvBw70vl.js","/_astro/git-rebase.CgB5NAD0.js","/_astro/github-dark-default.Cuk6v7N8.js","/_astro/github-dark-dimmed.DH5Ifo-i.js","/_astro/github-dark-high-contrast.E3gJ1_iC.js","/_astro/github-dark.DHJKELXO.js","/_astro/github-light-default.D7oLnXFd.js","/_astro/github-light-high-contrast.BfjtVDDH.js","/_astro/github-light.DAi9KRSo.js","/_astro/gleam.BspZqrRM.js","/_astro/glimmer-js.D1eqLnLL.js","/_astro/glimmer-ts.2bsbny7_.js","/_astro/glsl.DyqZbVRN.js","/_astro/gn.n2N0HUVH.js","/_astro/gnuplot.DdkO51Og.js","/_astro/go.C27-OAKa.js","/_astro/graphql.BG5Wfmbq.js","/_astro/groovy.gcz8RCvz.js","/_astro/gruvbox-dark-hard.CFHQjOhq.js","/_astro/gruvbox-dark-medium.GsRaNv29.js","/_astro/gruvbox-dark-soft.CVdnzihN.js","/_astro/gruvbox-light-hard.CH1njM8p.js","/_astro/gruvbox-light-medium.DRw_LuNl.js","/_astro/gruvbox-light-soft.hJgmCMqR.js","/_astro/hack.DumbXoZH.js","/_astro/haml.CKNntyJD.js","/_astro/handlebars.CyUR32XF.js","/_astro/haskell.Df6bDoY_.js","/_astro/haxe.CzTSHFRz.js","/_astro/hcl.BWvSN4gD.js","/_astro/hjson.D5-asLiD.js","/_astro/hlsl.D3lLCCz7.js","/_astro/horizon-bright.CUuTKBJd.js","/_astro/horizon.BUw7H-hv.js","/_astro/houston.DnULxvSX.js","/_astro/html-derivative.Jn_18P7D.js","/_astro/html.QW0909HF.js","/_astro/http.BtUIaMwx.js","/_astro/hurl.U6HWahqM.js","/_astro/hxml.D1AJYkwz.js","/_astro/hy.DFXneXwc.js","/_astro/imba.DGztddWO.js","/_astro/index.B4XecE38.js","/_astro/index.CMOwuIo1.js","/_astro/index.DW9MGD3z.js","/_astro/index.DaCY4rV6.js","/_astro/ini.BEwlwnbL.js","/_astro/java.CylS5w8V.js","/_astro/javascript.wDzz0qaB.js","/_astro/jinja.C8GEHRir.js","/_astro/jison.DVLNWbJO.js","/_astro/json.Cp-IABpG.js","/_astro/json5.C9tS-k6U.js","/_astro/jsonc.Des-eS-w.js","/_astro/jsonl.DcaNXYhu.js","/_astro/jsonnet.DFQXde-d.js","/_astro/jssm.C2t-YnRu.js","/_astro/jsx.g9-lgVsj.js","/_astro/jszip.min.B-U89c_R.js","/_astro/julia.C_P9pjDC.js","/_astro/just.B3KmxxRJ.js","/_astro/kanagawa-dragon.CkXjmgJE.js","/_astro/kanagawa-lotus.CfQXZHmo.js","/_astro/kanagawa-wave.DWedfzmr.js","/_astro/kdl.DV7GczEv.js","/_astro/kotlin.BdnUsdx6.js","/_astro/kusto.wEQ09or8.js","/_astro/laserwave.DUszq2jm.js","/_astro/latex.CfQlEqvu.js","/_astro/lean.BZvkOJ9d.js","/_astro/less.B1dDrJ26.js","/_astro/light-plus.B7mTdjB0.js","/_astro/liquid.DgzZE9DL.js","/_astro/llvm.DjAJT7YJ.js","/_astro/log.2UxHyX5q.js","/_astro/logo.BtOb2qkB.js","/_astro/lua.DRn5k6VU.js","/_astro/luau.KW6xsasC.js","/_astro/make.CHLpvVh8.js","/_astro/markdown.Cvjx9yec.js","/_astro/marko.DCAGaY4B.js","/_astro/material-theme-darker.BfHTSMKl.js","/_astro/material-theme-lighter.B0m2ddpp.js","/_astro/material-theme-ocean.CyktbL80.js","/_astro/material-theme-palenight.Csfq5Kiy.js","/_astro/material-theme.D5KoaKCx.js","/_astro/matlab.D7o27uSR.js","/_astro/mdc.Dsm3NULF.js","/_astro/mdx.Cmh6b_Ma.js","/_astro/mermaid.mWjccvbQ.js","/_astro/min-dark.CafNBF8u.js","/_astro/min-light.CTRr51gU.js","/_astro/mipsasm.CKIfxQSi.js","/_astro/mojo.rZm6bMo-.js","/_astro/monokai.D4h5O-jR.js","/_astro/moonbit._H4v1dQx.js","/_astro/move.IF9eRakj.js","/_astro/narrat.DRg8JJMk.js","/_astro/nextflow-groovy.vE_lwT2v.js","/_astro/nextflow.G7hYJypm.js","/_astro/nginx.BblOZO6J.js","/_astro/night-owl-light.CMTm3GFP.js","/_astro/night-owl.C39BiMTA.js","/_astro/nim.6P6MGcUZ.js","/_astro/nix.CwoSXNpI.js","/_astro/nord.Ddv68eIx.js","/_astro/nushell.Cz2AlsmD.js","/_astro/objective-c.DXmwc3jG.js","/_astro/objective-cpp.CLxacb5B.js","/_astro/ocaml.C0hk2d4L.js","/_astro/odin.BBf5iR-q.js","/_astro/one-dark-pro.DVMEJ2y_.js","/_astro/one-light.C3Wv6jpd.js","/_astro/openscad.C4EeE6gA.js","/_astro/pascal.D93ZcfNL.js","/_astro/perl.D1SIrzVG.js","/_astro/php.yYn84ZJR.js","/_astro/pkl.u5AG7uiY.js","/_astro/plastic.3e1v2bzS.js","/_astro/plsql.ChMvpjG-.js","/_astro/po.BTJTHyun.js","/_astro/poimandres.CS3Unz2-.js","/_astro/polar.C0HS_06l.js","/_astro/postcss.CXtECtnM.js","/_astro/powerquery.CEu0bR-o.js","/_astro/powershell.Dpen1YoG.js","/_astro/prisma.Dd19v3D-.js","/_astro/prolog.CbFg5uaA.js","/_astro/proto.C7zT0LnQ.js","/_astro/pug.DrS1a_C2.js","/_astro/puppet.BMWR74SV.js","/_astro/purescript.CklMAg4u.js","/_astro/python.B6aJPvgy.js","/_astro/qml.Bn7K45KN.js","/_astro/qmldir.C8lEn-DE.js","/_astro/qss.IeuSbFQv.js","/_astro/r.Dspwwk_N.js","/_astro/racket.BqYA7rlc.js","/_astro/raku.DXvB9xmW.js","/_astro/razor.B-nF4ujN.js","/_astro/red.bN70gL4F.js","/_astro/reg.C-SQnVFl.js","/_astro/regexp.CDVJQ6XC.js","/_astro/rel.C3B-1QV4.js","/_astro/riscv.BM1_JUlF.js","/_astro/ron.D8l8udqQ.js","/_astro/rose-pine-dawn.DHQR4-dF.js","/_astro/rose-pine-moon.D4_iv3hh.js","/_astro/rose-pine.qdsjHGoJ.js","/_astro/rosmsg.BJDFO7_C.js","/_astro/rst.S16V7Rkb.js","/_astro/ruby.CoKQ_x1T.js","/_astro/rust.B1yitclQ.js","/_astro/sas.Dc9gSVXr.js","/_astro/sass.Cj5Yp3dK.js","/_astro/scala.C151Ov-r.js","/_astro/scheme.C98Dy4si.js","/_astro/scss.CcblZge7.js","/_astro/sdbl.DVxCFoDh.js","/_astro/shaderlab.yPvxg9J0.js","/_astro/shellscript.Yzrsuije.js","/_astro/shellsession.caH0oxFO.js","/_astro/slack-dark.BthQWCQV.js","/_astro/slack-ochin.DqwNpetd.js","/_astro/smalltalk.BERRCDM3.js","/_astro/snazzy-light.Bw305WKR.js","/_astro/solarized-dark.DXbdFlpD.js","/_astro/solarized-light.L9t79GZl.js","/_astro/solidity.rGO070M0.js","/_astro/soy.CwPW4r5n.js","/_astro/sparql.DjVdNVty.js","/_astro/splunk.BtCnVYZw.js","/_astro/sql.CRqJ_cUM.js","/_astro/ssh-config._ykCGR6B.js","/_astro/stata.3K7hjnwR.js","/_astro/stylus.BEDo0Tqx.js","/_astro/surrealql.BJ-4anmD.js","/_astro/svelte.DszoPEZd.js","/_astro/swift.D82vCrfD.js","/_astro/synthwave-84.CbfX1IO0.js","/_astro/system-verilog.CnnmHF94.js","/_astro/systemd.4A_iFExJ.js","/_astro/talonscript.CkByrt1z.js","/_astro/tasl.QIJgUcNo.js","/_astro/tcl.dwOrl1Do.js","/_astro/templ.NAdjHxDV.js","/_astro/terraform.BETggiCN.js","/_astro/tex.NTV6TB-1.js","/_astro/tokyo-night.hegEt444.js","/_astro/toml.vGWfd6FD.js","/_astro/ts-tags.Dd8duizY.js","/_astro/tsv.B_m7g4N7.js","/_astro/tsx.COt5Ahok.js","/_astro/turtle.BsS91CYL.js","/_astro/twig.D2_2f7L2.js","/_astro/typescript.BPQ3VLAy.js","/_astro/typespec.CAFt9gP4.js","/_astro/typst.DHCkPAjA.js","/_astro/v.BcVCzyr7.js","/_astro/vala.CsfeWuGM.js","/_astro/vb.D17OF-Vu.js","/_astro/verilog.BQ8w6xss.js","/_astro/vesper.DRje8inN.js","/_astro/vhdl.CeAyd5Ju.js","/_astro/viml.CJc9bBzg.js","/_astro/vitesse-black.Bkuqu6BP.js","/_astro/vitesse-dark.D0r3Knsf.js","/_astro/vitesse-light.CVO1_9PV.js","/_astro/vue-html.Bn4RB85F.js","/_astro/vue-vine.Cf8QsMmp.js","/_astro/vue.LmlDJ_T2.js","/_astro/vyper.CDx5xZoG.js","/_astro/wasm.CG6Dc4jp.js","/_astro/wasm.MzD3tlZU.js","/_astro/wenyan.BV7otONQ.js","/_astro/wgsl.Dx-B1_4e.js","/_astro/wikitext.BhOHFoWU.js","/_astro/window.CTezTnwM.js","/_astro/wit.5i3qLPDT.js","/_astro/wolfram.lXgVvXCa.js","/_astro/xlsx.CNerDvZX.js","/_astro/xml.CzC_-KeP.js","/_astro/xsl.DhWfo-gc.js","/_astro/yaml.Buea-lGh.js","/_astro/zenscript.DVFEvuxE.js","/_astro/zig.VOosw3JB.js","/_astro/AppLayout.Bkx4XoN2.css"],"buildFormat":"directory","checkOrigin":true,"actionBodySizeLimit":1048576,"serverIslandBodySizeLimit":1048576,"allowedDomains":[],"key":"5tKo/qAXwwPIp31HiKQrIbn9Wa5rEXL/ALnyxG1eRQ4=","sessionConfig":{"driver":"unstorage/drivers/fs-lite","options":{"base":"/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/node_modules/.astro/sessions"}},"image":{},"devToolbar":{"enabled":false,"debugInfoOutput":""},"logLevel":"info","shouldInjectCspMetaTags":false}));
    const manifestRoutes = _manifest.routes;
    const manifest = Object.assign(_manifest, {
        renderers,
        actions: ()=>import('./noop-entrypoint_BOlrdqWF.mjs'),
        middleware: ()=>import('../virtual_astro_middleware.mjs'),
        sessionDriver: ()=>import('./_virtual_astro_session-driver_Bk3Q189E.mjs'),
        serverIslandMappings: ()=>import('./_virtual_astro_server-island-manifest_CQQ1F5PF.mjs'),
        routes: manifestRoutes,
        pageMap
    });
    const createApp$1 = ({ streaming } = {})=>{
        const app = new App(manifest, streaming);
        app.setFetchHandler(fetchable);
        return app;
    };
    const createApp = createApp$1;
    const mode = "standalone";
    const client = "file:///Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/dist/client/";
    const server = "file:///Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/dist/server/";
    const host = "127.0.0.1";
    const port = 4321;
    const staticHeaders = false;
    const bodySizeLimit = 1073741824;
    const experimentalDisableStreaming = false;
    options = Object.freeze(Object.defineProperty({
        __proto__: null,
        bodySizeLimit,
        client,
        experimentalDisableStreaming,
        host,
        mode,
        port,
        server,
        staticHeaders
    }, Symbol.toStringTag, {
        value: 'Module'
    }));
    const createOutgoingHttpHeaders = (headers)=>{
        if (!headers) {
            return void 0;
        }
        const nodeHeaders = Object.fromEntries(headers.entries());
        if (Object.keys(nodeHeaders).length === 0) {
            return void 0;
        }
        if (headers.has("set-cookie")) {
            const cookieHeaders = headers.getSetCookie();
            if (cookieHeaders.length > 1) {
                nodeHeaders["set-cookie"] = cookieHeaders;
            }
        }
        return nodeHeaders;
    };
    function createRequestFromNodeRequest(req, { skipBody = false, allowedDomains = [], bodySizeLimit, port: serverPort } = {}) {
        const controller = new AbortController();
        const isEncrypted = "encrypted" in req.socket && req.socket.encrypted;
        const protocol = isEncrypted ? "https" : "http";
        const hostname = typeof req.headers.host === "string" ? req.headers.host : typeof req.headers[":authority"] === "string" ? req.headers[":authority"] : serverPort ? `localhost:${serverPort}` : "localhost";
        let url;
        try {
            url = new URL(`${protocol}://${hostname}${req.url}`);
        } catch  {
            url = new URL(`${protocol}://${hostname}`);
        }
        const options = {
            method: req.method || "GET",
            headers: makeRequestHeaders(req),
            signal: controller.signal
        };
        const bodyAllowed = options.method !== "HEAD" && options.method !== "GET" && skipBody === false;
        if (bodyAllowed) {
            Object.assign(options, makeRequestBody(req, bodySizeLimit));
        }
        const request = new Request(url, options);
        wireAbortController(req, controller);
        const untrustedHostname = req.headers.host ?? req.headers[":authority"];
        const validatedHostname = validateHost(typeof untrustedHostname === "string" ? untrustedHostname : void 0, protocol, allowedDomains);
        const forwardedHost = getFirstForwardedValue(req.headers["x-forwarded-host"]);
        const hostValidated = validatedHostname !== void 0 || forwardedHost !== void 0 && allowedDomains.length > 0;
        const forwardedClientIp = hostValidated ? getFirstForwardedValue(req.headers["x-forwarded-for"]) : void 0;
        const clientIp = forwardedClientIp || req.socket?.remoteAddress;
        if (clientIp) {
            Reflect.set(request, clientAddressSymbol, clientIp);
        }
        return request;
    }
    function wireAbortController(req, controller) {
        const socket = getRequestSocket(req);
        if (socket && typeof socket.on === "function") {
            const existingCleanup = getAbortControllerCleanup(req);
            if (existingCleanup) {
                existingCleanup();
            }
            let cleanedUp = false;
            const removeSocketListener = ()=>{
                if (typeof socket.off === "function") {
                    socket.off("close", onSocketClose);
                } else if (typeof socket.removeListener === "function") {
                    socket.removeListener("close", onSocketClose);
                }
            };
            const cleanup = ()=>{
                if (cleanedUp) return;
                cleanedUp = true;
                removeSocketListener();
                controller.signal.removeEventListener("abort", cleanup);
                Reflect.deleteProperty(req, nodeRequestAbortControllerCleanupSymbol);
            };
            const onSocketClose = ()=>{
                cleanup();
                if (!controller.signal.aborted) {
                    controller.abort();
                }
            };
            socket.on("close", onSocketClose);
            controller.signal.addEventListener("abort", cleanup, {
                once: true
            });
            Reflect.set(req, nodeRequestAbortControllerCleanupSymbol, cleanup);
            if (socket.destroyed) {
                onSocketClose();
            }
        }
    }
    async function writeResponse(source, destination) {
        const { status, headers, body, statusText } = source;
        if (!(destination instanceof Http2ServerResponse)) {
            destination.statusMessage = statusText;
        }
        destination.writeHead(status, createOutgoingHttpHeaders(headers));
        const cleanupAbortFromDestination = getAbortControllerCleanup(destination.req ?? void 0);
        if (cleanupAbortFromDestination) {
            const runCleanup = ()=>{
                cleanupAbortFromDestination();
                if (typeof destination.off === "function") {
                    destination.off("finish", runCleanup);
                    destination.off("close", runCleanup);
                } else {
                    destination.removeListener?.("finish", runCleanup);
                    destination.removeListener?.("close", runCleanup);
                }
            };
            destination.on("finish", runCleanup);
            destination.on("close", runCleanup);
        }
        if (!body) return destination.end();
        try {
            const reader = body.getReader();
            destination.on("close", ()=>{
                reader.cancel().catch((err)=>{
                    console.error("There was an uncaught error in the middle of the stream while rendering %s.", destination.req.url, err);
                });
            });
            let result = await reader.read();
            while(!result.done){
                destination.write(result.value);
                result = await reader.read();
            }
            destination.end();
        } catch (err) {
            destination.write("Internal server error", ()=>{
                err instanceof Error ? destination.destroy(err) : destination.destroy();
            });
        }
    }
    function makeRequestHeaders(req) {
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)){
            if (value === void 0) {
                continue;
            }
            if (Array.isArray(value)) {
                for (const item of value){
                    headers.append(name, item);
                }
            } else {
                headers.append(name, value);
            }
        }
        return headers;
    }
    function makeRequestBody(req, bodySizeLimit) {
        if (req.body !== void 0) {
            if (typeof req.body === "string" && req.body.length > 0) {
                return {
                    body: Buffer.from(req.body)
                };
            }
            if (req.body instanceof ArrayBuffer || ArrayBuffer.isView(req.body)) {
                return {
                    body: req.body
                };
            }
            if (typeof req.body === "object" && req.body !== null && Object.keys(req.body).length > 0) {
                return {
                    body: Buffer.from(JSON.stringify(req.body))
                };
            }
            if (typeof req.body === "object" && req.body !== null && typeof req.body[Symbol.asyncIterator] !== "undefined") {
                return asyncIterableToBodyProps(req.body, bodySizeLimit);
            }
        }
        return asyncIterableToBodyProps(req, bodySizeLimit);
    }
    function asyncIterableToBodyProps(iterable, bodySizeLimit) {
        const source = bodySizeLimit != null ? limitAsyncIterable(iterable, bodySizeLimit) : iterable;
        return {
            body: source,
            duplex: "half"
        };
    }
    async function* limitAsyncIterable(iterable, limit) {
        let received = 0;
        for await (const chunk of iterable){
            const byteLength = chunk instanceof Uint8Array ? chunk.byteLength : typeof chunk === "string" ? Buffer.byteLength(chunk) : 0;
            received += byteLength;
            if (received > limit) {
                throw new Error(`Body size limit exceeded: received more than ${limit} bytes`);
            }
            yield chunk;
        }
    }
    function getAbortControllerCleanup(req) {
        if (!req) return void 0;
        const cleanup = Reflect.get(req, nodeRequestAbortControllerCleanupSymbol);
        return typeof cleanup === "function" ? cleanup : void 0;
    }
    function getRequestSocket(req) {
        if (req.socket && typeof req.socket.on === "function") {
            return req.socket;
        }
        const http2Socket = req.stream?.session?.socket;
        if (http2Socket && typeof http2Socket.on === "function") {
            return http2Socket;
        }
        return void 0;
    }
    function resolveClientDir(options) {
        const clientURLRaw = new URL(options.client);
        const serverURLRaw = new URL(options.server);
        const rel = path.relative(url.fileURLToPath(serverURLRaw), url.fileURLToPath(clientURLRaw));
        const serverFolder = path.basename(options.server);
        let serverEntryFolderURL = path.dirname(import.meta.url);
        let previous = "";
        while(!serverEntryFolderURL.endsWith(serverFolder)){
            if (serverEntryFolderURL === previous) {
                throw new Error(`[@astrojs/node] Could not find the server directory "${serverFolder}" by walking up from "${import.meta.url}". This can happen when the server entry point is bundled into a single file (e.g. with esbuild) so that import.meta.url no longer contains the original "${serverFolder}" path segment. When bundling the server entry, make sure the output path contains a "${serverFolder}" directory segment, or avoid bundling the server entry entirely.`);
            }
            previous = serverEntryFolderURL;
            serverEntryFolderURL = path.dirname(serverEntryFolderURL);
        }
        const serverEntryURL = serverEntryFolderURL + "/entry.mjs";
        const clientURL = new URL(appendForwardSlash(rel), serverEntryURL);
        return url.fileURLToPath(clientURL);
    }
    async function readErrorPageFromDisk(client, status) {
        const filePaths = [
            `${status}.html`,
            `${status}/index.html`
        ];
        for (const filePath of filePaths){
            const fullPath = path.join(client, filePath);
            let stream;
            try {
                stream = createReadStream(fullPath);
                await new Promise((resolve, reject)=>{
                    stream.once("open", ()=>resolve());
                    stream.once("error", reject);
                });
                const webStream = Readable.toWeb(stream);
                return new Response(webStream, {
                    headers: {
                        "Content-Type": "text/html; charset=utf-8"
                    }
                });
            } catch  {
                stream?.destroy();
            }
        }
        return void 0;
    }
    function createAppHandler(app, options) {
        const als = new AsyncLocalStorage();
        const logger = app.adapterLogger;
        process.on("unhandledRejection", (reason)=>{
            const requestUrl = als.getStore();
            logger.error(`Unhandled rejection while rendering ${requestUrl}`);
            console.error(reason);
        });
        const client = resolveClientDir(options);
        const prerenderedErrorPageFetch = async (url)=>{
            const { pathname } = new URL(url);
            if (pathname.endsWith("/404.html") || pathname.endsWith("/404/index.html")) {
                const response = await readErrorPageFromDisk(client, 404);
                if (response) return response;
            }
            if (pathname.endsWith("/500.html") || pathname.endsWith("/500/index.html")) {
                const response = await readErrorPageFromDisk(client, 500);
                if (response) return response;
            }
            return new Response(null, {
                status: 404
            });
        };
        const effectiveBodySizeLimit = options.bodySizeLimit === 0 || options.bodySizeLimit === Number.POSITIVE_INFINITY ? void 0 : options.bodySizeLimit;
        return async (req, res, next, locals)=>{
            let request;
            try {
                request = createRequestFromNodeRequest(req, {
                    allowedDomains: app.getAllowedDomains?.() ?? [],
                    bodySizeLimit: effectiveBodySizeLimit,
                    port: options.port
                });
            } catch (err) {
                logger.error(`Could not render ${req.url}`);
                console.error(err);
                res.statusCode = 500;
                res.end("Internal Server Error");
                return;
            }
            const routeData = app.match(request, true);
            if (routeData && !(routeData.type === "page" && routeData.prerender)) {
                const response = await als.run(request.url, ()=>app.render(request, {
                        addCookieHeader: true,
                        locals,
                        routeData,
                        prerenderedErrorPageFetch
                    }));
                await writeResponse(response, res);
            } else if (next) {
                const cleanup = getAbortControllerCleanup(req);
                if (cleanup) cleanup();
                return next();
            } else {
                const response = await app.render(request, {
                    addCookieHeader: true,
                    prerenderedErrorPageFetch
                });
                await writeResponse(response, res);
            }
        };
    }
    const wildcardHosts = new Set([
        "0.0.0.0",
        "::",
        "0000:0000:0000:0000:0000:0000:0000:0000"
    ]);
    async function logListeningOn(logger, server, configuredHost) {
        await new Promise((resolve)=>server.once("listening", resolve));
        const protocol = server instanceof https.Server ? "https" : "http";
        const host = getResolvedHostForHttpServer(configuredHost);
        const { port } = server.address();
        const address = getNetworkAddress(protocol, host, port);
        if (host === void 0 || wildcardHosts.has(host)) {
            logger.info(`Server listening on 
  local: ${address.local[0]} 	
  network: ${address.network[0]}
`);
        } else {
            logger.info(`Server listening on ${address.local[0]}`);
        }
    }
    function getResolvedHostForHttpServer(host) {
        if (host === false) {
            return "localhost";
        } else if (host === true) {
            return void 0;
        } else {
            return host;
        }
    }
    function getNetworkAddress(protocol = "http", hostname, port, base) {
        const NetworkAddress = {
            local: [],
            network: []
        };
        Object.values(os.networkInterfaces()).flatMap((nInterface)=>nInterface ?? []).filter((detail)=>detail && detail.address && detail.family === "IPv4").forEach((detail)=>{
            let host = detail.address.replace("127.0.0.1", hostname === void 0 || wildcardHosts.has(hostname) ? "localhost" : hostname);
            if (host.includes(":")) {
                host = `[${host}]`;
            }
            const url = `${protocol}://${host}:${port}${""}`;
            if (detail.address.includes("127.0.0.1")) {
                NetworkAddress.local.push(url);
            } else {
                NetworkAddress.network.push(url);
            }
        });
        return NetworkAddress;
    }
    function resolveStaticPath(client, urlPath) {
        const filePath = path.join(client, urlPath);
        const resolved = path.resolve(filePath);
        const resolvedClient = path.resolve(client);
        if (resolved !== resolvedClient && !resolved.startsWith(resolvedClient + path.sep)) {
            return {
                filePath: resolved,
                isDirectory: false
            };
        }
        let isDirectory = false;
        try {
            isDirectory = fs.lstatSync(filePath).isDirectory();
        } catch  {}
        return {
            filePath: resolved,
            isDirectory
        };
    }
    function createStaticHandler(app, options, headersMap) {
        const client = resolveClientDir(options);
        return (req, res, ssr)=>{
            if (req.url) {
                let fullUrl = req.url;
                if (req.url.includes("#")) {
                    fullUrl = fullUrl.slice(0, req.url.indexOf("#"));
                }
                const [urlPath, urlQuery] = fullUrl.split("?");
                const { isDirectory } = resolveStaticPath(client, app.removeBase(urlPath));
                const hasSlash = urlPath.endsWith("/");
                let pathname = urlPath;
                switch(app.manifest.trailingSlash){
                    case "never":
                        {
                            if (isDirectory && urlPath !== "/" && hasSlash) {
                                pathname = urlPath.slice(0, -1) + (urlQuery ? "?" + urlQuery : "");
                                res.statusCode = 301;
                                res.setHeader("Location", pathname);
                                return res.end();
                            }
                            if (isDirectory && !hasSlash) {
                                pathname = `${urlPath}/index.html`;
                            }
                            break;
                        }
                    case "ignore":
                        {
                            if (isDirectory && !hasSlash) {
                                pathname = `${urlPath}/index.html`;
                            }
                            break;
                        }
                    case "always":
                        {
                            if (!hasSlash && !hasFileExtension(urlPath) && !isInternalPath(urlPath)) {
                                pathname = urlPath + "/" + (urlQuery ? "?" + urlQuery : "");
                                res.statusCode = 301;
                                res.setHeader("Location", pathname);
                                return res.end();
                            }
                            break;
                        }
                }
                pathname = prependForwardSlash(app.removeBase(pathname));
                const normalizedPathname = path.posix.normalize(pathname);
                const stream = send(req, normalizedPathname, {
                    root: client,
                    dotfiles: normalizedPathname.startsWith("/.well-known/") ? "allow" : "deny",
                    extensions: app.manifest.buildFormat === "file" || app.manifest.buildFormat === "preserve" ? [
                        "html"
                    ] : []
                });
                let forwardError = false;
                stream.on("error", (err)=>{
                    if (forwardError) {
                        const status = "statusCode" in err ? err.statusCode : 500;
                        if (status >= 500) {
                            console.error(err.toString());
                        }
                        res.writeHead(status);
                        res.end(status >= 500 ? "Internal server error" : "");
                        return;
                    }
                    ssr();
                });
                stream.on("file", ()=>{
                    forwardError = true;
                });
                stream.on("stream", ()=>{
                    if (normalizedPathname.startsWith(`/${app.manifest.assetsDir}/`)) {
                        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
                    }
                });
                stream.pipe(res);
            } else {
                ssr();
            }
        };
    }
    function prependForwardSlash(pth) {
        return pth.startsWith("/") ? pth : "/" + pth;
    }
    const hostOptions = (host)=>{
        if (typeof host === "boolean") {
            return host ? "0.0.0.0" : "localhost";
        }
        return host;
    };
    function standalone(app, options, headersMap) {
        const port = process.env.PORT ? Number(process.env.PORT) : options.port ?? 8080;
        const host = process.env.HOST ?? hostOptions(options.host);
        const resolvedOptions = {
            ...options,
            port
        };
        const handler = createStandaloneHandler(app, resolvedOptions);
        const server = createServer(handler, host, port);
        server.server.listen(port, host);
        if (process.env.ASTRO_NODE_LOGGING !== "disabled") {
            logListeningOn(app.adapterLogger, server.server, host);
        }
        server.server.on("close", ()=>{
            app.logger.close();
        });
        return {
            server,
            done: server.closed()
        };
    }
    function createStandaloneHandler(app, options, headersMap) {
        const appHandler = createAppHandler(app, options);
        const staticHandler = createStaticHandler(app, options);
        return (req, res)=>{
            try {
                decodeURI(req.url);
            } catch  {
                res.writeHead(400);
                res.end("Bad request.");
                return;
            }
            staticHandler(req, res, ()=>appHandler(req, res));
        };
    }
    function createServer(listener, host, port) {
        let httpServer;
        if (process.env.SERVER_CERT_PATH && process.env.SERVER_KEY_PATH) {
            httpServer = https.createServer({
                key: fs.readFileSync(process.env.SERVER_KEY_PATH),
                cert: fs.readFileSync(process.env.SERVER_CERT_PATH)
            }, listener);
        } else {
            httpServer = http.createServer(listener);
        }
        enableDestroy(httpServer);
        const closed = new Promise((resolve, reject)=>{
            httpServer.addListener("close", resolve);
            httpServer.addListener("error", reject);
        });
        const previewable = {
            host,
            port,
            closed () {
                return closed;
            },
            async stop () {
                await new Promise((resolve, reject)=>{
                    httpServer.destroy((err)=>err ? reject(err) : resolve(void 0));
                });
            }
        };
        return {
            server: httpServer,
            ...previewable
        };
    }
    const app = createApp({
        streaming: true
    });
    handler = createStandaloneHandler(app, options);
    startServer = ()=>standalone(app, options);
    if (process.env.ASTRO_NODE_AUTOSTART !== "disabled") {
        startServer();
    }
})();
export { AstroError as A, ExpectedImage as E, FailedToFetchRemoteImageDimensions as F, IncompatibleDescriptorOptions as I, LocalImageUsedWrongly as L, MissingImageDimension as M, NoImageMetadata as N, RemoteImageNotAllowed as R, UnsupportedImageFormat as U, isRemotePath as a, UnsupportedImageConversion as b, InvalidImageService as c, ExpectedImageOptions as d, ExpectedNotESMImage as e, ImageMissingAlt as f, addAttribute as g, renderTemplate as h, isRemoteAllowed as i, joinPaths as j, FontFamilyNotFound as k, MissingGetFontFileRequestUrl as l, maybeRenderHead as m, isParentDirectory as n, InvalidComponentArgs as o, renderComponent as p, renderHead as q, removeQueryString as r, spreadAttributes as s, defineScriptVars as t, unescapeHTML as u, MissingSharp as v, handler as w, options as x, startServer as y, __tla };
