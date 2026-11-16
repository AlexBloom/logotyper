import AppKit
import CoreText
import ImageIO
import UniformTypeIdentifiers
struct Word:Decodable {let text:String;let size:CGFloat;let fontPath:String?;let postscript:String;let x:CGFloat;let y:CGFloat;let rotation:CGFloat;let tracking:CGFloat;let outline:Bool;let stroke:CGFloat}
struct Document:Decodable {let width:Int;let height:Int;let words:[Word];let output:String}
let doc=try JSONDecoder().decode(Document.self,from:Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[1])))
struct Shape {let p:CGPath;let fill:Bool;let width:CGFloat}
func rect(_ x:CGFloat,_ y:CGFloat,_ w:CGFloat,_ h:CGFloat)->CGPath {CGPath(rect:CGRect(x:x,y:y,width:w,height:h),transform:nil)}
func ellipse(_ x:CGFloat,_ y:CGFloat,_ w:CGFloat,_ h:CGFloat)->CGPath {CGPath(ellipseIn:CGRect(x:x,y:y,width:w,height:h),transform:nil)}
func line(_ pts:[CGPoint],close:Bool=false)->CGPath {let p=CGMutablePath();if let a=pts.first{p.move(to:a);for b in pts.dropFirst(){p.addLine(to:b)};if close{p.closeSubpath()}};return p}
func textPath(_ text:String,_ font:CTFont,_ tracking:CGFloat=0)->CGPath {
 let a=NSAttributedString(string:text,attributes:[NSAttributedString.Key(kCTFontAttributeName as String):font,NSAttributedString.Key.kern:tracking]);let l=CTLineCreateWithAttributedString(a);let p=CGMutablePath()
 for r in CTLineGetGlyphRuns(l) as! [CTRun] {let rf=(CTRunGetAttributes(r) as NSDictionary)[kCTFontAttributeName] as! CTFont;let n=CTRunGetGlyphCount(r);var gs=[CGGlyph](repeating:0,count:n);var pos=[CGPoint](repeating:.zero,count:n);CTRunGetGlyphs(r,CFRange(location:0,length:0),&gs);CTRunGetPositions(r,CFRange(location:0,length:0),&pos)
 for i in 0..<n {if let g=CTFontCreatePathForGlyph(rf,gs[i],nil){let t=CGAffineTransform(translationX:pos[i].x,y:pos[i].y);p.addPath(g,transform:t)}}};return p
}
func fitted(_ p:CGPath,_ box:CGRect,stretch:Bool=false,slant:CGFloat=0)->CGPath {let b=p.boundingBoxOfPath;let sx=box.width/b.width;let sy=box.height/b.height;let s=min(sx,sy);let xx=stretch ? sx:s;let yy=stretch ? sy:s;var t=CGAffineTransform(a:xx,b:0,c:slant,d:-yy,tx:box.midX-b.midX*xx-b.midY*slant,ty:box.midY+b.midY*yy);return p.copy(using:&t)!}
func star(_ x:CGFloat,_ y:CGFloat,_ r:CGFloat,_ k:Int=4)->CGPath {var pts:[CGPoint]=[];for j in 0..<k*2 {let a=CGFloat(j)*CGFloat.pi/CGFloat(k)-CGFloat.pi/2;let rr=j%2==0 ? r:r*0.24;pts.append(CGPoint(x:x+cos(a)*rr,y:y+sin(a)*rr))};return line(pts,close:true)}
func svgPath(_ p:CGPath)->String {var s="";p.applyWithBlock{ptr in let e=ptr.pointee;let q=e.points;func xy(_ i:Int)->String {String(format:"%.2f %.2f",Double(q[i].x),Double(q[i].y))};switch e.type {case .moveToPoint:s+="M"+xy(0);case .addLineToPoint:s+="L"+xy(0);case .addQuadCurveToPoint:s+="Q"+xy(0)+" "+xy(1);case .addCurveToPoint:s+="C"+xy(0)+" "+xy(1)+" "+xy(2);case .closeSubpath:s+="Z";@unknown default:break}};return s}
func makeImage(_ w:Int,_ h:Int,_ draw:(CGContext)->Void)->CGImage {let c=CGContext(data:nil,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!;c.setFillColor(CGColor(gray:1,alpha:1));c.fill(CGRect(x:0,y:0,width:w,height:h));c.translateBy(x:0,y:CGFloat(h));c.scaleBy(x:1,y:-1);draw(c);return c.makeImage()!}
func savePNG(_ im:CGImage,_ file:String){let dst=CGImageDestinationCreateWithURL(URL(fileURLWithPath:file) as CFURL,UTType.png.identifier as CFString,1,nil)!;CGImageDestinationAddImage(dst,im,nil);CGImageDestinationFinalize(dst)}
func render(_ c:CGContext,_ sh:[Shape],inverse:Bool=false){c.setFillColor(CGColor(red:inverse ? 1:41.0/255,green:inverse ? 1:43.0/255,blue:inverse ? 1:36.0/255,alpha:1));c.setStrokeColor(CGColor(red:inverse ? 1:41.0/255,green:inverse ? 1:43.0/255,blue:inverse ? 1:36.0/255,alpha:1));for a in sh {c.addPath(a.p);if a.fill{c.fillPath()}else{c.setLineWidth(a.width);c.strokePath()}}}


var shapes:[Shape]=[]
for w in doc.words {
 let f:CTFont
 if let path=w.fontPath {
  let url=URL(fileURLWithPath:path) as CFURL
  CTFontManagerRegisterFontsForURL(url,.process,nil)
  if let ds=CTFontManagerCreateFontDescriptorsFromURL(url) as? [CTFontDescriptor],let d=ds.first(where:{(CTFontDescriptorCopyAttribute($0,kCTFontNameAttribute) as? String)==w.postscript}) {f=CTFontCreateWithFontDescriptor(d,100,nil)}else{f=CTFontCreateWithName(w.postscript as CFString,100,nil)}
 }else{f=CTFontCreateWithName(w.postscript as CFString,100,nil)}
 let p=textPath(w.text,f,w.tracking)
 var t=CGAffineTransform(translationX:w.x,y:w.y).rotated(by:w.rotation * .pi/180).scaledBy(x:w.size/100,y:-w.size/100)
 shapes.append(Shape(p:p.copy(using:&t)!,fill:!w.outline,width:w.stroke))
}
let paths=shapes.map{"<path d=\"\(svgPath($0.p))\" fill=\"\($0.fill ? "#292b24":"none")\" stroke=\"\($0.fill ? "none":"#292b24")\" stroke-width=\"\($0.width)\"/>"}.joined()
let svg="<!-- Users are responsible for their own font licensing. -->\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 \(doc.width) \(doc.height)\">"+paths+"</svg>"
try svg.write(toFile:doc.output+".svg",atomically:true,encoding:.utf8)
savePNG(makeImage(doc.width*2,doc.height*2){c in c.scaleBy(x:2,y:2);render(c,shapes)},doc.output+".png")
