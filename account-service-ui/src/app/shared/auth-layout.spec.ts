import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting,HttpTestingController} from '@angular/common/http/testing';
import {WorkspaceBrand} from './workspace-brand';
import {AuthAppGallery} from './auth-app-gallery';
import {SuperReg} from '../super-reg/super-reg';
import {Login} from '../login/login';
import {AuthService} from '../auth.service';
import {appRegistry,appLogo,brandMarkUrl} from '@greatley-poshley/suite';

describe('Shared sign-in and registration layout',()=>{
  beforeEach(()=>TestBed.configureTestingModule({providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),{provide:AuthService,useValue:{}}]}));
  it('supports a logo-only company mark while other headers keep the Professy name',()=>{
    const fixture=TestBed.createComponent(WorkspaceBrand);fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Professy');
    fixture.componentRef.setInput('app','');fixture.componentRef.setInput('name','');fixture.componentRef.setInput('iconOnly',true);fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brand-wordmark')).toBeNull();
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(brandMarkUrl);
    expect(fixture.nativeElement.querySelector('[role=img]').getAttribute('aria-label')).toBe('Greatley Poshley');
  });
  it('lists every suite app with the same canonical app artwork',()=>{
    const fixture=TestBed.createComponent(AuthAppGallery);fixture.detectChanges();
    const rows=[...fixture.nativeElement.querySelectorAll('.gp-auth-app')] as HTMLElement[];
    const apps=appRegistry();
    expect(rows.length).toBe(apps.length);
    rows.forEach((row,i)=>{expect(row.textContent?.trim()).toBe(apps[i].name);expect(row.querySelector('img')?.getAttribute('src')).toBe(appLogo(apps[i].id));});
  });
  it('keeps the sign-in bridge functional with company branding and no extra header actions',()=>{
    vi.spyOn(Login.prototype,'signIn').mockResolvedValue();
    const fixture=TestBed.createComponent(Login);fixture.detectChanges();
    const header=fixture.nativeElement.querySelector('.gp-auth-header');
    expect(header.querySelectorAll('a').length).toBe(1);
    expect(header.querySelector('.brand-wordmark').textContent).toBe('Greatley Poshley');
    expect(fixture.nativeElement.querySelector('.gp-auth-footer').textContent).toContain('Greatley Poshley Ltd.');
    expect(fixture.nativeElement.querySelector('.gp-auth-split app-auth-app-gallery')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.gp-auth-form-pane #sign-in-heading')).toBeTruthy();
    fixture.nativeElement.querySelector('.gp-auth-submit').click();
    expect(fixture.componentInstance.signIn).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
  it('keeps all three registration steps and validation in the right-hand pane',()=>{
    const fixture=TestBed.createComponent(SuperReg);fixture.detectChanges();const c=fixture.componentInstance;
    const header=fixture.nativeElement.querySelector('.gp-auth-header');
    expect(header.querySelectorAll('a').length).toBe(1);expect(header.querySelector('.brand-wordmark').textContent).toBe('Greatley Poshley');
    expect(fixture.nativeElement.querySelector('.gp-auth-footer').textContent).toContain('Greatley Poshley Ltd.');
    expect(fixture.nativeElement.querySelector('.gp-auth-split app-auth-app-gallery')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.hero-section')).toBeNull();
    expect(fixture.nativeElement.querySelector('.gp-auth-form-pane [formgroupname=organisation]')).toBeTruthy();
    expect(c.registrationForm.get('organisation.title')?.hasError('required')).toBe(true);
    c.currentStep=1;fixture.changeDetectorRef.markForCheck();fixture.detectChanges();
    for(const name of ['firstName','lastName','email','phone','gender','password','confirmPassword'])expect(fixture.nativeElement.querySelector('[formcontrolname="'+name+'"]')).toBeTruthy();
    c.currentStep=2;fixture.changeDetectorRef.markForCheck();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.registration-progress [aria-current=step]').textContent).toContain('Plan');
    TestBed.inject(HttpTestingController).expectNone(()=>true);
  });
});
