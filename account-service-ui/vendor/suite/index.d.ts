export function appRegistry(includeHidden?:boolean):{id:string;name:string;caption:string;port:number;symbol:string;color:string;icon:string;logo:string;url:string}[];
export function appUrl(id:string,params?:Record<string,any>):string;
export function defineAppMenu():void;
export class SuiteAuth {constructor(clientId:string);clientId:string;csrf:string;call(path:string,method?:string,body?:any,token?:string):Promise<any>;adopt(token:string,replace?:boolean):Promise<any>;resume():Promise<any>;bootstrap():Promise<any>;signIn():Promise<void>;logout():Promise<void>;}

export declare function defineWorkspaceShell(): void;

export declare function subscribeWorkspace(token:()=>string,receive:(event:any)=>void|Promise<void>):()=>void;

export declare function applyTheme(value?:string):void;
export declare function setTheme(value:string):void;
export declare function defineTheme():void;

export function definePeopleCard():void;

export function defineBrand():void;
export const brandMarkUrl:string;
export function appLogo(id:string):string;
export function appLogoSvg(id:string):string;

export function appIconPath(id:string):string;

export const brandColors:readonly string[];
