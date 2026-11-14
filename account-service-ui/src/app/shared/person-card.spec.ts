import {TestBed} from '@angular/core/testing';
import {provideHttpClient,HttpHeaders} from '@angular/common/http';
import {provideHttpClientTesting,HttpTestingController} from '@angular/common/http/testing';
import {PersonCard} from './person-card';
import {AuthService} from '../auth.service';
import {ChatlyLauncher} from './chatly-launcher.service';
import {environment} from '../../environment';
describe('Explicit profile details',()=>{
 beforeEach(()=>TestBed.configureTestingModule({imports:[PersonCard],providers:[provideHttpClient(),provideHttpClientTesting(),{provide:AuthService,useValue:{getCurrentUserId:()=>7,getAuthHeaders:()=>new HttpHeaders()}},{provide:ChatlyLauncher,useValue:{person:vi.fn()}}]}));
 it('loads a profile only after its details button is activated and closes on outside click',async()=>{
  const fixture=TestBed.createComponent(PersonCard);fixture.componentRef.setInput('id',8);fixture.componentRef.setInput('name','Alex');fixture.componentRef.setInput('designation','Engineer');fixture.detectChanges();
  const http=TestBed.inject(HttpTestingController);fixture.nativeElement.querySelector('article').dispatchEvent(new Event('mouseenter'));http.expectNone(()=>true);
  const button=fixture.nativeElement.querySelector('.gp-person-details') as HTMLButtonElement;button.click();fixture.detectChanges();http.expectOne(environment.apiBaseUrlM+'/users/8').flush({id:8,email:'alex@example.test',phone:'123'});fixture.detectChanges();await fixture.whenStable();
  expect(button.getAttribute('aria-expanded')).toBe('true');expect(document.querySelector('.gp-person-preview')?.textContent).toContain('alex@example.test');
  (document.querySelector('.cdk-overlay-backdrop') as HTMLElement).click();fixture.detectChanges();expect(button.getAttribute('aria-expanded')).toBe('false');http.verify();fixture.destroy();
 });
});
