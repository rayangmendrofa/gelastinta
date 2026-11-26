import CoolProp.CoolProp as CP, math, json, sys
F='Nitrogen'; R=296.8; g=1.4; G=math.sqrt(g)*(2/(g+1))**((g+1)/(2*(g-1)))
def run(V, At, pc=50e5, p_end=55e5, dt=0.005, T0=293.15, p0=10000*6894.757, Twall=None):
    rho=CP.PropsSI('D','T',T0,'P',p0,F); m=rho*V; u=CP.PropsSI('U','T',T0,'P',p0,F)
    t=0; out=[]; m0=m
    while True:
        d=m/V
        p=CP.PropsSI('P','D',d,'U',u,F); T=CP.PropsSI('T','D',d,'U',u,F); h=CP.PropsSI('H','D',d,'U',u,F)
        pch=min(pc,p*0.9)
        Tc=CP.PropsSI('T','P',pch,'H',h,F)             # regulator throttles at constant enthalpy
        s=CP.PropsSI('S','P',pch,'H',h,F)
        try:
            he=CP.PropsSI('H','P',101325,'S',s,F)
        except Exception:
            he=CP.PropsSI('H','P',101325,'Q',0.0,F)
        ve=math.sqrt(max(0,2*(h-he)))
        md=pch*At*G/math.sqrt(R*Tc)
        out.append(dict(t=round(t,3),p=p/1e5,T=T,m=m,mdot=md,F=md*ve,ve=ve,Tc=Tc))
        if p<p_end or m<0.02*m0: break
        u_new=(m*u - md*h*dt)/(m-md*dt)
        m-=md*dt; u=u_new; t+=dt
    return out
if __name__=='__main__':
    for V,At in ((0.2,float(sys.argv[1]) if len(sys.argv)>1 else 6e-4),):
        o=run(V,At)
        print('V',V,'At',At,'burn',o[-1]['t'],'s', 'F0',round(o[0]['F']/1e3,1),'kN','Fend',round(o[-1]['F']/1e3,1),'used',round(o[0]['m']-o[-1]['m'],1),'of',round(o[0]['m'],1),'kg','Tend',round(o[-1]['T']),'K','ve0',round(o[0]['ve']),'Tc0',round(o[0]['Tc']))
