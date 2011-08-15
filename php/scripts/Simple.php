<?php
echo "Line 1\n";
$var1 = array('key'=>'value1','items'=>array('item1','item2'));
echo "Line 2\n";
func1($var1);
echo "Line 3\n";
function func1($in)
{
    $var2 = $in;
    array_push($in['items'], 'item3');
    echo "Function 1\n";
    func2($in, $var2);
}
function func2($in1, $in2)
{
    echo "Function 2\n";
    var_dump($in1);
    var_dump(array_diff($in1['items'], $in2['items']));
}