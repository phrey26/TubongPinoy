# Jupiter epic effects

Canvas-only effects in `jupiter-effects.ts`: a small tilted orbit with two moons, plus cream, copper, and rust-colored atmospheric dust on flight, launch, and shooter collisions. Rear/front orbit passes surround the shooter. No new sound effects or CSS are used; physics is unchanged.

Ownership and equipment of persistent ID `shooter_jupiter` are required before drawing or spawning effects. Catalog rotation can remove the shop listing without affecting existing owners. Future skins must receive new IDs rather than reuse this ID.

Dust lasts 0.4 seconds and is capped at 56 particles. Reduced motion clears dust and displays a static orbit. Pause freezes animation; shooter reset and teardown clear effects; losing eligibility clears effects on the next frame. Target-to-target collisions do not gain Jupiter effects.

Shooter collisions produce 20 faster storm flecks and a cream/copper expanding impact ring lasting 0.48 seconds (up to 128 pixels wide). A brief pale contact flash and dark ring outline improve contrast. Rings render over the marbles so the contact stays visible; up to eight coexist. Launch and orbit retain their smaller epic treatment.
