import {TestBed} from '@angular/core/testing';
import {ElementRef} from '@angular/core';
import {MatAutocompleteTrigger} from '@angular/material/autocomplete';
import {PersonPickerComponent} from './person-picker';

describe('Ticket assignee and reporter picker',()=>{
  afterEach(()=>{vi.useRealTimers();TestBed.resetTestingModule();});

  it('formats IDs and already formatted names without producing User NaN',()=>{
    const picker=new PersonPickerComponent();
    picker.people=[{id:8,name:'Kavya Krishnan',lookupIds:[82]},{id:-4,name:'Review agent'}];
    picker.value=8;
    for(const value of [8,'8',82,'Kavya Krishnan'])expect(picker.displayPerson(value)).toBe('Kavya Krishnan');
    expect(picker.displayPerson(-4)).toBe('Review agent');
    for(const value of [NaN,Infinity,null,'NaN','User NaN'])expect(picker.displayPerson(value)).toBe('Unassigned');
    picker.value=15;picker.selectedName='Maya Chen';expect(picker.displayPerson(15)).toBe('Maya Chen');
  });

  it('keeps the name visible through Material model writes and option selection',async()=>{
    const fixture=TestBed.createComponent(PersonPickerComponent);
    fixture.componentRef.setInput('people',[{id:8,name:'Kavya Krishnan'},{id:9,name:'Maya Chen'}]);
    fixture.componentRef.setInput('value',8);
    fixture.detectChanges();await fixture.whenStable();
    const input=fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Kavya Krishnan');
    fixture.componentInstance.choose(9);fixture.detectChanges();await fixture.whenStable();
    expect(input.value).toBe('Maya Chen');
    expect(fixture.nativeElement.textContent).not.toContain('User NaN');
    fixture.destroy();
  });

  it('opens and focuses a newly activated inline editor without a second click',()=>{
    vi.useFakeTimers();
    const picker=new PersonPickerComponent();picker.autoOpen=true;
    const input={focus:vi.fn(),select:vi.fn()},openPanel=vi.fn();
    picker.input=new ElementRef(input as unknown as HTMLInputElement);
    picker.trigger={openPanel} as unknown as MatAutocompleteTrigger;
    picker.ngAfterViewInit();expect(openPanel).not.toHaveBeenCalled();vi.runOnlyPendingTimers();
    expect(input.focus).toHaveBeenCalledOnce();expect(input.select).toHaveBeenCalledOnce();expect(openPanel).toHaveBeenCalledOnce();
    picker.ngOnDestroy();
  });

  it('emits the selected user ID and keeps its display label in sync',async()=>{
    const fixture=TestBed.createComponent(PersonPickerComponent),selected=vi.fn();
    fixture.componentRef.setInput('people',[{id:8,name:'Kavya Krishnan'},{id:9,name:'Maya Chen'}]);
    fixture.componentRef.setInput('value',8);
    fixture.componentInstance.selected.subscribe(selected);
    fixture.detectChanges();
    fixture.componentInstance.choose(9);await fixture.whenStable();
    expect(selected).toHaveBeenCalledWith(9);
    expect(fixture.componentInstance.displayText).toBe('Maya Chen');
    fixture.destroy();
  });

  it('does not reopen a destroyed editor or emit a malformed assignment',()=>{
    vi.useFakeTimers();const picker=new PersonPickerComponent();picker.autoOpen=true;
    const openPanel=vi.fn(),selected=vi.fn();picker.trigger={openPanel} as unknown as MatAutocompleteTrigger;
    picker.selected.subscribe(selected);picker.ngAfterViewInit();picker.ngOnDestroy();vi.runOnlyPendingTimers();
    expect(openPanel).not.toHaveBeenCalled();
    picker.choose(NaN);picker.choose(Infinity);picker.choose(0);expect(selected).not.toHaveBeenCalled();
    picker.choose(-4);expect(selected).toHaveBeenCalledWith(-4);picker.choose(null);expect(selected).toHaveBeenLastCalledWith(null);
  });
});
