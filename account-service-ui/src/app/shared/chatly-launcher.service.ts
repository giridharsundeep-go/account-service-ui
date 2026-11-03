import {Injectable,inject} from '@angular/core';import {SuiteSessionService} from './suite-session.service';
@Injectable({providedIn:'root'})export class ChatlyLauncher {
 private suite=inject(SuiteSessionService);
 open(conversation?:number){this.suite.open('chatly',{conversation});}
 team(teamId:number){this.suite.open('chatly',{teamId});}
 person(userId:number){this.suite.open('chatly',{userId});}
}
