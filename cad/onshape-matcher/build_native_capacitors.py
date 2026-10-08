"""Build ordinary Onshape sketch/extrude/pattern definitions from the saved CAD inputs.

This creates request payloads locally. It does not contact or modify Onshape.
Plate profiles use native circular/elliptical arcs and straight segments rather
than mesh samples. Dimensions and counts use ordinary Onshape features.
"""
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parent
INPUT = json.loads((ROOT / 'geometry-input.json').read_text())


def enum(pid, kind, value):
    return {'btType': 'BTMParameterEnum-145', 'parameterId': pid, 'enumName': kind, 'value': value}


def quantity(pid, expression, integer=False):
    return {'btType': 'BTMParameterQuantity-147', 'parameterId': pid,
            'expression': expression, 'isInteger': integer}


def boolean(pid, value):
    return {'btType': 'BTMParameterBoolean-144', 'parameterId': pid, 'value': value}


def string(pid, value):
    return {'btType': 'BTMParameterString-149', 'parameterId': pid, 'value': value}


def query(pid, expression):
    return {'btType': 'BTMParameterQueryList-148', 'parameterId': pid,
            'queries': [{'btType': 'BTMIndividualQuery-138', 'queryString': 'query=' + expression + ';'}]}


def mm(value):
    return f'{value * 1000:.12g} mm'


def created(fid, entity='BODY'):
    return f'qCreatedBy(makeId("{fid}"), EntityType.{entity})'


def union(expressions):
    return 'qUnion([' + ','.join(expressions) + '])'


def feature(fid, name, kind, parameters):
    return {'btType': 'BTMFeature-134', 'featureId': fid, 'name': name,
            'featureType': kind, 'namespace': '', 'suppressed': False,
            'parameters': parameters}


def polygon(center, points):
    return {'type': 'polygon', 'points': [[p[0] + center[0], p[1] + center[1]] for p in points]}


def rectangle(center, width, height):
    return polygon(center, [[-width / 2, -height / 2], [width / 2, -height / 2],
                            [width / 2, height / 2], [-width / 2, height / 2]])


def circle(center, radius):
    return {'type': 'circle', 'center': center, 'radius': radius}


def hexagon(center, radius):
    return polygon(center, [[radius * math.cos(i * math.pi / 3), radius * math.sin(i * math.pi / 3)]
                            for i in range(6)])


def arc_path(center, segments):
    """A compact editable path; sampled points below are only for region selection."""
    x, z = center
    converted, points = [], []
    for segment in segments:
        item = dict(segment)
        if item['type'] == 'line':
            item['start'] = [x + item['start'][0], z + item['start'][1]]
            item['end'] = [x + item['end'][0], z + item['end'][1]]
            points.append(item['start'])
        else:
            item['center'] = [x + item['center'][0], z + item['center'][1]]
            a, b = item['startAngle'], item['endAngle']
            for i in range(49):
                t = a + (b - a) * i / 48
                points.append([item['center'][0] + item['radius'] * math.cos(t),
                               item['center'][1] + item.get('minorRadius', item['radius']) * math.sin(t)])
        converted.append(item)
    return {'type': 'path', 'segments': converted, 'points': points}


def line_segment(start, end):
    return {'type': 'line', 'start': start, 'end': end}


def arc_segment(center, radius, start, end, minor=None):
    result = {'type': 'arc', 'center': center, 'radius': radius, 'startAngle': start, 'endAngle': end}
    if minor is not None:
        result['minorRadius'] = minor
    return result


def simple_stator(center, large=False, half_width=.019):
    if not large:
        r, bore, ear = .019, .004, .0035
        segments = [line_segment([r, ear], [r, 0]), arc_segment([0, 0], r, 0, -math.pi),
                    line_segment([-r, 0], [-r, ear]), line_segment([-r, ear], [-bore, ear]),
                    line_segment([-bore, ear], [-bore, 0]), arc_segment([0, 0], bore, math.pi, 2 * math.pi),
                    line_segment([bore, 0], [bore, ear]), line_segment([bore, ear], [r, ear])]
    else:
        w, h, relief = half_width, .0195, .0046
        a, b = -math.pi / 4, -7 * math.pi / 4
        end = [w * math.cos(2 * math.pi - .20), h * math.sin(2 * math.pi - .20)]
        ca, cb = [relief * math.cos(a), relief * math.sin(a)], [relief * math.cos(b), relief * math.sin(b)]
        segments = [line_segment([w, .018], [-w, .018]), line_segment([-w, .018], [-w, 0]),
                    arc_segment([0, 0], w, math.pi, 2 * math.pi - .20, h),
                    line_segment(end, [.0038, -.0038]), line_segment([.0038, -.0038], ca),
                    arc_segment([0, 0], relief, a, b), line_segment(cb, [w, .0038]),
                    line_segment([w, .0038], [w, .018])]
    return arc_path(center, segments)


def simple_rotor(pivot, radius, angle, eccentric=0):
    # A single offset circular arc replaces the sampled logarithmic contour.
    c = [-eccentric, 0]
    a = [c[0] + radius * math.cos(angle), radius * math.sin(angle)]
    b = [c[0] + radius * math.cos(angle + math.pi), radius * math.sin(angle + math.pi)]
    return arc_path(pivot, [line_segment([0, 0], a), arc_segment(c, radius, angle, angle + math.pi),
                            line_segment(b, [0, 0])])


def sketch(fid, name, profiles):
    entities, constraints = [], []
    for n, profile in enumerate(profiles):
        prefix = f'p{n}'
        if profile['type'] == 'circle':
            x, z = profile['center']
            entities.append({'btType': 'BTMSketchCurve-4', 'entityId': prefix,
                             'centerId': prefix + '.center', 'isConstruction': False,
                             'geometry': {'btType': 'BTCurveGeometryCircle-115',
                                          'radius': profile['radius'], 'xCenter': x, 'yCenter': z,
                                          'xDir': 1, 'yDir': 0, 'clockwise': False}})
            constraints.append({'btType': 'BTMSketchConstraint-2', 'constraintType': 'DIAMETER',
                                'entityId': prefix + 'diameter', 'parameters': [
                                    string('localFirst', prefix), quantity('length', mm(2 * profile['radius']))]})
            continue
        if profile['type'] == 'path':
            for i, part in enumerate(profile['segments']):
                eid = prefix + 'e' + str(i)
                entity = {'btType': 'BTMSketchCurveSegment-155', 'entityId': eid,
                          'startPointId': eid + '.start', 'endPointId': eid + '.end', 'isConstruction': False}
                if part['type'] == 'line':
                    a, b = part['start'], part['end']
                    dx, dz = b[0] - a[0], b[1] - a[1]
                    length = math.hypot(dx, dz)
                    entity.update(startParam=0, endParam=length, geometry={
                        'btType': 'BTCurveGeometryLine-117', 'pntX': a[0], 'pntY': a[1],
                        'dirX': dx / length, 'dirY': dz / length})
                else:
                    clockwise = part['endAngle'] < part['startAngle']
                    sign = -1 if clockwise else 1
                    geometry = {'btType': 'BTCurveGeometryCircle-115', 'radius': part['radius'],
                                'xCenter': part['center'][0], 'yCenter': part['center'][1],
                                'xDir': 1, 'yDir': 0, 'clockwise': clockwise}
                    if 'minorRadius' in part:
                        geometry.update(btType='BTCurveGeometryEllipse-1189', minorRadius=part['minorRadius'])
                    entity.update(startParam=sign * part['startAngle'], endParam=sign * part['endAngle'],
                                  centerId=eid + '.center', geometry=geometry)
                    if 'minorRadius' not in part:
                        constraints.append({'btType': 'BTMSketchConstraint-2', 'constraintType': 'RADIUS',
                                            'entityId': eid + 'radius', 'parameters': [
                                                string('localFirst', eid), quantity('length', mm(part['radius']))]})
                entities.append(entity)
                constraints.append({'btType': 'BTMSketchConstraint-2', 'constraintType': 'COINCIDENT',
                                    'entityId': eid + 'join', 'parameters': [
                                        string('localFirst', eid + '.end'),
                                        string('localSecond', prefix + 'e' + str((i + 1) % len(profile['segments'])) + '.start')]})
            continue
        points = profile['points']
        if math.dist(points[0], points[-1]) < 1e-10:
            points = points[:-1]
        for i, start in enumerate(points):
            finish = points[(i + 1) % len(points)]
            dx, dz = finish[0] - start[0], finish[1] - start[1]
            length = math.hypot(dx, dz)
            if length < 1e-10:
                raise ValueError('Degenerate profile edge')
            eid = prefix + 'e' + str(i)
            entities.append({'btType': 'BTMSketchCurveSegment-155', 'entityId': eid,
                             'startPointId': eid + '.start', 'endPointId': eid + '.end',
                             'startParam': 0, 'endParam': length, 'isConstruction': False,
                             'geometry': {'btType': 'BTCurveGeometryLine-117',
                                          'pntX': start[0], 'pntY': start[1],
                                          'dirX': dx / length, 'dirY': dz / length}})
            constraints.append({'btType': 'BTMSketchConstraint-2', 'constraintType': 'COINCIDENT',
                                'entityId': eid + 'join', 'parameters': [
                                    string('localFirst', eid + '.end'),
                                    string('localSecond', prefix + 'e' + str((i + 1) % len(points)) + '.start')]})
    result = feature(fid, name, 'newSketch', [query('sketchPlane', created('Front', 'FACE')),
                                             boolean('disableImprinting', True)])
    result.update(btType='BTMSketch-151', entities=entities, constraints=constraints)
    return result


def region(sketch_id, point=None):
    expression = f'qSketchRegion(makeId("{sketch_id}"), true)'
    if point is not None:
        expression = f'qContainsPoint({expression}, vector({point[0]:.16g},0,{point[1]:.16g})*meter)'
    return expression


def extrude(fid, name, sketch_id, start, depth, point=None):
    return feature(fid, name, 'extrude', [
        enum('bodyType', 'ExtendedToolBodyType', 'SOLID'),
        enum('operationType', 'NewBodyOperationType', 'NEW'),
        query('entities', region(sketch_id, point)), enum('endBound', 'BoundingType', 'BLIND'),
        quantity('depth', depth), boolean('oppositeDirection', True), boolean('startOffset', True),
        enum('startOffsetBound', 'StartOffsetType', 'BLIND'),
        quantity('startOffsetDistance', start), boolean('startOffsetOppositeDirection', True)])


def inside(point, polygon_points):
    x, y = point
    result = False
    for a, b in zip(polygon_points, polygon_points[1:] + polygon_points[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            result = not result
    return result


def interior_point(points, holes):
    xmin, xmax = min(p[0] for p in points), max(p[0] for p in points)
    zmin, zmax = min(p[1] for p in points), max(p[1] for p in points)
    for i in range(1, 20):
        for j in range(1, 20):
            p = [xmin + (xmax - xmin) * i / 20, zmin + (zmax - zmin) * j / 20]
            if inside(p, points) and all(math.dist(p, h['center']) > h['radius'] + 0.0001 for h in holes):
                return p
    raise ValueError('No profile interior point')


def native_capacitor(index):
    spec = INPUT['components'][index - 1]
    prefix = f'C{index}'
    lo, hi = spec['sourceEnvelopeM']
    center = [(a + b) / 2 for a, b in zip(lo, hi)]
    pivot = spec['shaftM']
    large = index == 3
    count = spec['statorPlateCountEstimate']
    thickness = spec['plateThicknessEstimateM']
    first, last = (lo[1] + .011, hi[1] - .011) if large else (.01875, .06447)
    front, rear = (lo[1] + .002, hi[1] - .003) if large else (.01304, .06650)
    pitch = (last - first) / (count - 1)
    items, fixed, moving = [], [], []
    pitch_expression = f'({mm(last - first)})/(#{prefix}_plateCount - 1)'
    items += [feature(prefix + '_count', prefix + ' fixed plate count', 'assignVariable', [
        enum('mode', 'VariableMode', 'ASSIGNED'), enum('variableType', 'VariableType', 'NUMBER'),
        string('name', prefix + '_plateCount'), quantity('numberValue', str(count)), quantity('value', str(count))]),
        feature(prefix + '_thickness', prefix + ' plate thickness', 'assignVariable', [
        enum('mode', 'VariableMode', 'ASSIGNED'), enum('variableType', 'VariableType', 'LENGTH'),
        string('name', prefix + '_plateThickness'), quantity('lengthValue', mm(thickness)), quantity('value', mm(thickness))])]

    def add(label, profiles, y, depth, group, point=None, offset_expression=None):
        base = prefix + '_' + label
        sid, eid = base + '_sketch', base + '_extrude'
        items.append(sketch(sid, prefix + ' ' + label.replace('_', ' ') + ' profile', profiles))
        items.append(extrude(eid, prefix + ' ' + label.replace('_', ' '), sid,
                             offset_expression or mm(y - depth / 2), mm(depth), point))
        group.append(created(eid))
        return eid

    def pattern(label, seed, group, rotor=False):
        fid = prefix + '_' + label
        items.append(feature(fid, prefix + ' ' + label.replace('_', ' '), 'linearPattern', [
            enum('patternType', 'PatternType', 'PART'), enum('operationType', 'NewBodyOperationType', 'NEW'),
            query('entities', created(seed)), query('directionOne', created('Front', 'FACE')),
            quantity('distance', pitch_expression),
            quantity('instanceCount', f'#{prefix}_plateCount' + (' - 1' if rotor else ''), True),
            boolean('oppositeDirection', True), boolean('isCentered', False), boolean('hasSecondDir', False)]))
        group.append(created(fid))

    stator_center = [pivot[0] if large else center[0], pivot[2]]
    stator_poly = simple_stator(stator_center, large, (hi[0] - lo[0]) * .475)
    shaft_hole = circle([pivot[0], pivot[2]], .0035)
    stator = add('stator_plate', [stator_poly, shaft_hole], first, thickness, fixed,
                 interior_point(stator_poly['points'], [shaft_hole]),
                 f'{mm(first)} - #{prefix}_plateThickness/2')
    items[-1]['parameters'][4] = quantity('depth', f'#{prefix}_plateThickness')
    pattern('stator_plate_pattern', stator, fixed)
    rotor_poly = simple_rotor([pivot[0], pivot[2]], .0205 if large else .0182,
                              math.pi * (1.025 if large else .13),
                              0 if large else (pivot[0] - center[0]) * .65)
    rod_holes = [] if large else [circle([center[0] + sign * .0164, pivot[2] - .006], .00205) for sign in (-1, 1)]
    rotor = add('rotor_plate', [rotor_poly] + rod_holes, first + pitch / 2, thickness, moving,
                interior_point(rotor_poly['points'], rod_holes),
                f'{mm(first)} + ({pitch_expression})/2 - #{prefix}_plateThickness/2')
    items[-1]['parameters'][4] = quantity('depth', f'#{prefix}_plateThickness')
    pattern('rotor_plate_pattern', rotor, moving, True)
    axis_start = lo[1] if large else -.00525
    axis_end = rear + .006
    add('tuning_shaft', [circle([pivot[0], pivot[2]], .003175)],
        (axis_start + axis_end) / 2, axis_end - axis_start, moving)
    for side, y in enumerate((front, rear)):
        name, outward = ('front', -1) if side == 0 else ('rear', 1)
        frame_center = [center[0], center[2]]
        width, height = (hi[0] - lo[0], hi[2] - lo[2]) if large else (.0384, .038)
        if large and side == 1:
            frame_center[1] -= .002
            width, height = width * .98, height * .92
        depth = .004 if large else (.003 if side == 0 else .0025)
        add(name + '_support', [rectangle(frame_center, width, height), circle([pivot[0], pivot[2]], .00355)], y, depth, fixed)
        face_y = y + outward * (.0038 if large else .0025)
        add(name + '_bearing', [circle([pivot[0], pivot[2]], .006), circle([pivot[0], pivot[2]], .0033)], face_y, .003, fixed)
        add(name + '_bearing_washer', [circle([pivot[0], pivot[2]], .0067), circle([pivot[0], pivot[2]], .0033)],
            face_y + outward * .002, .0008, fixed)
        add(name + '_bearing_nut', [hexagon([pivot[0], pivot[2]], .0058), circle([pivot[0], pivot[2]], .0033)],
            face_y + outward * .003, .0018, fixed)
    rod_x, rod_z = (.0218, center[2] + .018) if large else (.0164, pivot[2] - .006)
    rod_centers = [[center[0] + sign * rod_x, rod_z] for sign in (-1, 1)]
    add('stator_tie_rods', [circle(p, .00125) for p in rod_centers], (front + rear) / 2, rear - front + .010, fixed)
    sleeves = add('spacing_sleeves', [circle(p, .00175) for p in rod_centers],
                  first + pitch / 2, pitch - thickness, fixed,
                  offset_expression=f'{mm(first)} + #{prefix}_plateThickness/2')
    items[-1]['parameters'][4] = quantity('depth', f'({pitch_expression}) - #{prefix}_plateThickness')
    pattern('spacing_sleeve_pattern', sleeves, fixed, True)
    for side, y in enumerate((front, rear)):
        name, outward = ('front', -1) if side == 0 else ('rear', 1)
        rings = [item for p in rod_centers for item in (circle(p, .0036), circle(p, .00135))]
        nuts = [item for p in rod_centers for item in (hexagon(p, .003), circle(p, .00135))]
        add(name + '_tie_rod_washers', rings, y + outward * .003, .0007, fixed)
        add(name + '_tie_rod_nuts', nuts, y + outward * .004, .002, fixed)
    if large:
        terminal_centers = [[center[0] + sign * .019, center[2] + .011] for sign in (-1, 1)]
        add('RF_terminals', [rectangle(p, .0065, .006) for p in terminal_centers], front - .0028, .001, fixed)
        bridges = []
        for sign, start in zip((-1, 1), terminal_centers):
            finish = [center[0] + sign * rod_x, rod_z]
            dx, dz = finish[0] - start[0], finish[1] - start[1]
            length = math.hypot(dx, dz)
            px, pz = -dz / length * .0015, dx / length * .0015
            bridges.append({'type': 'polygon', 'points': [[start[0] - px, start[1] - pz],
                [finish[0] - px, finish[1] - pz], [finish[0] + px, finish[1] + pz], [start[0] + px, start[1] + pz]]})
        add('terminal_bridges', bridges, front - .0028, .001, fixed)
    else:
        inward = 1 if index == 1 else -1
        add('RF_terminal', [rectangle([center[0] + inward * .020, pivot[2] - .002], .005, .0008)], first + .006, .006, fixed)
    for label, bodies in (('fixed', fixed), ('rotor', moving)):
        fid = prefix + '_' + label + '_composite'
        items.append(feature(fid, prefix + (' fixed plates and supports' if label == 'fixed' else ' rotor plates and shaft'),
                             'compositePart', [query('bodies', union(bodies)), boolean('closed', True)]))
    return {'component': prefix, 'features': items, 'fixedBodies': fixed, 'rotorBodies': moving,
            'plateCount': count, 'plateThicknessM': thickness, 'platePitchM': pitch,
            'sourceEnvelopeM': spec['sourceEnvelopeM'], 'shaftM': pivot}


if __name__ == '__main__':
    result = [native_capacitor(i) for i in (1, 2, 3)]
    (ROOT / 'native-capacitor-plan.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps([{'component': c['component'], 'features': len(c['features']),
                      'fixedPlateCount': c['plateCount'], 'rotorPlateCount': c['plateCount'] - 1} for c in result]))
